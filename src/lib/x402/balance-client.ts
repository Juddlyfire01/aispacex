// Client for the app's x402 credit endpoints. The server (api/x402/*) is the
// source of truth for balance + ledger; this module wraps the fetch calls and
// the SIWE auth handshake. Endpoints are added in the x402-server task; until
// then these degrade gracefully (return local state) so the UI can render.

import { buildSiweStatement, randomNonce, signMessage } from './wallet'
import { usdcBaseUnitsToUsd } from './config'

export interface BalanceResponse {
  address: string
  balanceUsd: number
  sessionToken?: string
  /** Null when the session has no wall-clock expiry (revoked on Disconnect). */
  sessionExpiresAt?: number | null
  ledger?: Array<{
    id: string
    type: 'TOP_UP' | 'CHARGE' | 'REFUND'
    amountUsd: number
    balanceAfterUsd: number
    createdAt: string
    action?: string
  }>
}

export interface TopUpInfoResponse {
  receiver: string
  chainId: number
  asset: string
  minUsd: number
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = JSON.parse(text) as { error?: string; message?: string }
      message = body.error ?? body.message ?? message
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }
  return JSON.parse(text) as T
}

/**
 * Authenticate the wallet with a SIWE signature and fetch the spendable USD
 * balance. Returns null if the endpoint is not deployed yet (falls back to
 * local balance in the store).
 */
export async function fetchBalance(address: string): Promise<BalanceResponse | null> {
  const nonce = randomNonce()
  const statement = buildSiweStatement(address, nonce)
  let signature: string
  try {
    signature = await signMessage(address, statement)
  } catch {
    // User rejected the signature — surface as null (no balance read).
    return null
  }
  const res = await fetch('/api/x402/balance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, statement, signature, nonce }),
  })
  if (res.status === 404) return null // endpoint not deployed
  const body = await parseJson<{
    address: string
    balanceBaseUnits?: string
    balanceUsd?: number
    sessionToken?: string
    sessionExpiresAt?: number | null
    ledger?: BalanceResponse['ledger']
  }>(res)
  return {
    address: body.address,
    balanceUsd:
      body.balanceUsd != null
        ? body.balanceUsd
        : usdcBaseUnitsToUsd(body.balanceBaseUnits ?? '0'),
    sessionToken: body.sessionToken,
    sessionExpiresAt: body.sessionExpiresAt ?? null,
    ledger: body.ledger,
  }
}

/** Server-side session revoke (Credits Disconnect). Best-effort. */
export async function revokeSession(sessionToken: string): Promise<void> {
  try {
    await fetch('/api/x402/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    })
  } catch {
    // Local disconnect still proceeds if the network call fails.
  }
}

/** Fetch top-up instructions (receiver wallet, chain, asset, minimum). */
export async function fetchTopUpInfo(): Promise<TopUpInfoResponse | null> {
  const res = await fetch('/api/x402/top-up-info', { method: 'GET' })
  if (res.status === 404) return null
  return parseJson<TopUpInfoResponse>(res)
}

export interface SettleTopUpResult {
  walletAddress: string
  amountCredited: number
  newBalance: number
  paymentId: string | null
}

/**
 * After a successful on-chain USDC transfer, ask the server to verify the tx
 * and credit the wallet's internal balance. Requires a valid session token.
 */
export async function settleTopUp(opts: {
  address: string
  sessionToken: string
  txHash: string
  amountUsd: number
}): Promise<SettleTopUpResult> {
  const res = await fetch('/api/x402/top-up', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      address: opts.address,
      sessionToken: opts.sessionToken,
      txHash: opts.txHash,
      amountUsd: opts.amountUsd,
    }),
  })
  const body = await parseJson<{
    success?: boolean
    data?: SettleTopUpResult
    error?: string
  }>(res)
  if (!body.success || !body.data) {
    throw new Error(body.error ?? 'settle_failed')
  }
  return body.data
}
