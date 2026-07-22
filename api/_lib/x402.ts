// Server-side x402 helpers: SIWE verification, a Redis-backed credit ledger
// (balance + TOP_UP/CHARGE/REFUND rows), and a payment gate that returns the
// x402 v2 402 challenge for paid endpoints.
//
// Topology: the app's shared VENICE_API_KEY / X_BEARER_TOKEN keep paying the
// upstreams. x402 is the MONETIZATION layer — users top up USDC to the app's
// collection wallet, we credit an internal USD balance, and each paid action
// debits it (raw cost * margin). Settlement of the on-chain USDC transfer is
// delegated to a facilitator (X402_FACILITATOR_URL); this module owns the
// off-chain ledger + auth.

import { Redis } from '@upstash/redis'
import {
  verifyMessage,
  createPublicClient,
  http,
  parseAbiItem,
  parseEventLogs,
  type Hash,
} from 'viem'
import { base } from 'viem/chains'
import { createHmac, timingSafeEqual } from 'node:crypto'

const BAL_PREFIX = 'x402:bal:' // -> integer micro-USD (1e6 = $1.00)
const LEDGER_PREFIX = 'x402:ledger:' // -> list of JSON rows
const NONCE_PREFIX = 'x402:nonce:' // -> replay guard
const TX_PREFIX = 'x402:tx:' // -> idempotency: credited tx hashes
const LEDGER_CAP = 200
const NONCE_TTL_SEC = 600
const TX_TTL_SEC = 60 * 60 * 24 * 90 // 90 days

/** Redis balance scale: store USD as integer micros to avoid float drift in incrby. */
export const BALANCE_MICRO_SCALE = 1e6

const CHAIN_ID = 8453
const CHAIN_CAIP2 = 'eip155:8453'
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_DECIMALS = 6

/** Convert a Redis raw balance (micro-USD integer) to spendable USD. */
export function balanceRawToUsd(raw: string | number | null | undefined): number {
  const n = typeof raw === 'string' ? Number(raw) : (raw ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n / BALANCE_MICRO_SCALE)
}

export interface LedgerRow {
  id: string
  type: 'TOP_UP' | 'CHARGE' | 'REFUND'
  amountUsd: number
  balanceAfterUsd: number
  createdAt: string
  action?: string
  requestId?: string
}

let cached: Redis | null | undefined

function getRedis(): Redis | null {
  if (cached !== undefined) return cached
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  cached = url && token ? new Redis({ url, token }) : null
  return cached
}

export function x402KvConfigured(): boolean {
  return getRedis() !== null
}

/** The app's collection wallet (public). Payments settle here. */
export function receiverWallet(): string {
  return (process.env.X402_RECEIVER_WALLET ?? process.env.VITE_X402_RECEIVER_WALLET ?? '').trim()
}

/** Minimum top-up in USD. */
export function minTopUpUsd(): number {
  const raw = process.env.X402_MIN_TOPUP_USD ?? process.env.VITE_X402_MIN_TOPUP_USD
  const n = raw != null ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 5
}

/** Margin multiplier applied to raw cost. Server-authoritative (client mirrors it). */
export function marginMultiplier(): number {
  const raw = process.env.X402_MARGIN ?? process.env.VITE_X402_MARGIN
  const n = raw != null ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 1 ? n : 1.3
}

/** Charged USD for a raw cost (rawUsd * margin). */
export function chargedUsd(rawUsd: number): number {
  if (!(rawUsd > 0)) return 0
  return rawUsd * marginMultiplier()
}

function normAddr(addr: string): string {
  return addr.trim().toLowerCase()
}

function isAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim())
}

// ——— SIWE verification ———

export interface SiweAuth {
  address: string
  statement: string
  signature: string
  nonce: string
}

/**
 * Verify a SIWE-style signature: the signature must recover to `address`, the
 * statement must embed `address` + `nonce`, and the nonce must be single-use.
 * Returns the normalized address on success; throws on failure.
 */
export async function verifySiwe(auth: SiweAuth): Promise<string> {
  const address = normAddr(auth.address)
  if (!isAddress(address)) throw new AuthError('invalid_address')
  if (!auth.statement.includes(auth.address) && !auth.statement.toLowerCase().includes(address)) {
    throw new AuthError('statement_address_mismatch')
  }
  if (!auth.nonce || !auth.statement.includes(auth.nonce)) {
    throw new AuthError('statement_nonce_mismatch')
  }

  // Replay guard: nonce may be used once within the TTL window.
  const redis = getRedis()
  if (redis) {
    const key = NONCE_PREFIX + address + ':' + auth.nonce
    const set = await redis.set(key, '1', { nx: true, ex: NONCE_TTL_SEC })
    if (set === null) throw new AuthError('nonce_reused')
  }

  let valid = false
  try {
    valid = await verifyMessage({
      address: address as `0x${string}`,
      message: auth.statement,
      signature: auth.signature as `0x${string}`,
    })
  } catch {
    valid = false
  }
  if (!valid) throw new AuthError('bad_signature')
  return address
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

// ——— Balance + ledger ———

export async function getBalanceUsd(address: string): Promise<number> {
  const redis = getRedis()
  if (!redis) return 0
  const raw = await redis.get<string | number>(BAL_PREFIX + normAddr(address))
  return balanceRawToUsd(raw)
}

export async function getLedger(address: string, limit = 50, offset = 0): Promise<LedgerRow[]> {
  const redis = getRedis()
  if (!redis) return []
  const rows = await redis.lrange<LedgerRow | string>(
    LEDGER_PREFIX + normAddr(address),
    offset,
    offset + limit - 1,
  )
  return rows.map((r) => (typeof r === 'string' ? (JSON.parse(r) as LedgerRow) : r))
}

function newRowId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

async function pushRow(address: string, row: LedgerRow): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  const key = LEDGER_PREFIX + normAddr(address)
  await redis.lpush(key, JSON.stringify(row))
  await redis.ltrim(key, 0, LEDGER_CAP - 1)
}

/** Credit a top-up and append a TOP_UP row. Returns the new balance. */
export async function creditTopUp(address: string, amountUsd: number): Promise<number> {
  const redis = getRedis()
  if (!redis) throw new Error('x402_kv_not_configured')
  if (!(amountUsd > 0)) throw new Error('invalid_amount')
  const key = BAL_PREFIX + normAddr(address)
  // Store USD scaled to integer micros (6dp) to avoid float drift in incrby.
  const micro = Math.round(amountUsd * BALANCE_MICRO_SCALE)
  const after = (await redis.incrby(key, micro)) / BALANCE_MICRO_SCALE
  await pushRow(address, {
    id: newRowId('topup'),
    type: 'TOP_UP',
    amountUsd,
    balanceAfterUsd: after,
    createdAt: new Date().toISOString(),
  })
  return after
}

/**
 * Debit a charge if funds allow. Returns { ok, balanceAfter }. Atomicity note:
 * Upstash incrby is atomic; we read-then-guard, so a rare race could over-debit
 * by one concurrent request — acceptable for per-user single-session usage.
 */
export async function debitCharge(
  address: string,
  amountUsd: number,
  action?: string,
  requestId?: string,
): Promise<{ ok: boolean; balanceAfterUsd: number }> {
  const redis = getRedis()
  if (!redis) throw new Error('x402_kv_not_configured')
  if (!(amountUsd > 0)) {
    return { ok: true, balanceAfterUsd: await getBalanceUsd(address) }
  }
  const current = await getBalanceUsd(address)
  if (current < amountUsd) return { ok: false, balanceAfterUsd: current }
  const key = BAL_PREFIX + normAddr(address)
  const micro = Math.round(amountUsd * BALANCE_MICRO_SCALE)
  const after = (await redis.incrby(key, -micro)) / BALANCE_MICRO_SCALE
  await pushRow(address, {
    id: newRowId('charge'),
    type: 'CHARGE',
    amountUsd: -amountUsd,
    balanceAfterUsd: after,
    createdAt: new Date().toISOString(),
    action,
    requestId,
  })
  return { ok: true, balanceAfterUsd: after }
}

/** Refund a previously charged amount (e.g. failed upstream call). */
export async function creditRefund(
  address: string,
  amountUsd: number,
  action?: string,
): Promise<number> {
  const redis = getRedis()
  if (!redis) throw new Error('x402_kv_not_configured')
  if (!(amountUsd > 0)) return getBalanceUsd(address)
  const key = BAL_PREFIX + normAddr(address)
  const micro = Math.round(amountUsd * BALANCE_MICRO_SCALE)
  const after = (await redis.incrby(key, micro)) / BALANCE_MICRO_SCALE
  await pushRow(address, {
    id: newRowId('refund'),
    type: 'REFUND',
    amountUsd,
    balanceAfterUsd: after,
    createdAt: new Date().toISOString(),
    action,
  })
  return after
}

// ——— Session tokens ———
//
// After one SIWE sign the client gets a short-lived HMAC token so paid actions
// can debit without prompting a wallet signature per click. The token binds the
// address + an expiry; the server re-derives + timing-safe compares. Secret is
// X402_SESSION_SECRET (falls back to a per-boot random — tokens then reset on
// redeploy, which is acceptable: the client re-signs).

const SESSION_TTL_MS = 30 * 60 * 1000 // 30 min

let bootSecret: string | undefined
function sessionSecret(): string {
  const env = process.env.X402_SESSION_SECRET?.trim()
  if (env) return env
  if (!bootSecret) bootSecret = Math.random().toString(36).slice(2) + Date.now().toString(36)
  return bootSecret
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url')
}

/** Issue a session token for a verified address. */
export function issueSessionToken(address: string): { token: string; expiresAt: number } {
  const addr = normAddr(address)
  const expiresAt = Date.now() + SESSION_TTL_MS
  const payload = `${addr}.${expiresAt}`
  const token = `${payload}.${sign(payload)}`
  return { token, expiresAt }
}

/** Verify a session token; returns the address or null when invalid/expired. */
export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [addr, expStr, sig] = parts
  const expiresAt = Number(expStr)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null
  const expected = sign(`${addr}.${expStr}`)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  return addr
}

// ——— On-chain USDC transfer verification (v1 top-up) ———

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

function baseRpcUrl(): string {
  return (process.env.BASE_RPC_URL ?? 'https://mainnet.base.org').trim()
}

function publicClient() {
  return createPublicClient({
    chain: base,
    transport: http(baseRpcUrl()),
  })
}

export interface VerifiedTransfer {
  amountUsd: number
  from: string
  to: string
  txHash: string
}

/**
 * Claim a tx hash for credit (SET NX). Returns false if already credited.
 */
export async function claimTopUpTx(txHash: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) throw new Error('x402_kv_not_configured')
  const key = TX_PREFIX + txHash.toLowerCase()
  const set = await redis.set(key, '1', { nx: true, ex: TX_TTL_SEC })
  return set !== null
}

/** Release a claimed tx if credit failed after claim (best-effort). */
export async function releaseTopUpTx(txHash: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.del(TX_PREFIX + txHash.toLowerCase())
}

/**
 * Verify a USDC transfer on Base: receipt success, Transfer log from `from`
 * to the collection wallet for at least `minAmountUsd`.
 */
export async function verifyUsdcTransfer(opts: {
  txHash: string
  from: string
  minAmountUsd: number
}): Promise<VerifiedTransfer> {
  const receiver = receiverWallet()
  if (!receiver) throw new Error('receiver_not_configured')
  const from = normAddr(opts.from)
  const to = normAddr(receiver)
  const client = publicClient()
  const hash = opts.txHash as Hash

  const receipt = await client.getTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('tx_failed')

  const transfers = parseEventLogs({
    abi: [transferEvent],
    logs: receipt.logs,
    eventName: 'Transfer',
  })

  let credited = 0n
  for (const ev of transfers) {
    if (normAddr(ev.address) !== normAddr(USDC_BASE)) continue
    if (normAddr(ev.args.from as string) !== from) continue
    if (normAddr(ev.args.to as string) !== to) continue
    credited += ev.args.value as bigint
  }

  const amountUsd = Number(credited) / 10 ** USDC_DECIMALS
  if (!(amountUsd >= opts.minAmountUsd - 1e-9)) {
    throw new Error('amount_below_requested')
  }

  return { amountUsd, from, to, txHash: opts.txHash }
}

// ——— x402 v2 402 challenge ———

/**
 * Build the x402 v2 discovery / payment-required object for a USD amount.
 * `accepts[].amount` is USDC base units (6 decimals).
 */
export function buildPaymentRequired(amountUsd: number) {
  const amount = String(Math.round(Math.max(minTopUpUsd(), amountUsd) * 10 ** USDC_DECIMALS))
  return {
    x402Version: 2,
    error: 'Payment required',
    accepts: [
      {
        protocol: 'x402',
        version: 2,
        network: CHAIN_CAIP2,
        asset: USDC_BASE,
        amount,
        payTo: receiverWallet(),
      },
    ],
    extensions: {
      chainId: CHAIN_ID,
      tokenDecimals: USDC_DECIMALS,
      minimumAmountUsd: minTopUpUsd(),
    },
  }
}
