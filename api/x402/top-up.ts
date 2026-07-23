// /api/x402/top-up
//   POST (no body txHash, no X-402-Payment) → 402 discovery
//   POST { sessionToken, address, txHash, amountUsd } → verify USDC transfer on
//     Base, credit Redis ledger (v1 — produces real wallet activity)
//   POST + X-402-Payment header → optional facilitator settlement (future)
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildPaymentRequired,
  claimTopUpTx,
  creditTopUp,
  minTopUpUsd,
  releaseTopUpTx,
  verifySessionToken,
  verifyUsdcTransfer,
  x402KvConfigured,
} from '../_lib/x402.js'

const USDC_DECIMALS = 6

function facilitatorUrl(): string {
  return (process.env.X402_FACILITATOR_URL ?? '').trim()
}

async function settleViaFacilitator(
  paymentHeader: string,
): Promise<{ ok: boolean; amountUsd: number; error?: string; paymentId?: string }> {
  const url = facilitatorUrl()
  if (!url) return { ok: false, amountUsd: 0, error: 'facilitator_not_configured' }
  try {
    const resp = await fetch(url.replace(/\/$/, '') + '/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payment: paymentHeader, network: 'eip155:8453' }),
    })
    const data = (await resp.json()) as {
      success?: boolean
      amountBaseUnits?: string
      amountUsd?: number
      paymentId?: string
      error?: string
    }
    if (!resp.ok || !data.success) {
      return { ok: false, amountUsd: 0, error: data.error ?? `settle_failed_${resp.status}` }
    }
    const amountUsd =
      data.amountUsd != null
        ? data.amountUsd
        : Number(data.amountBaseUnits ?? '0') / 10 ** USDC_DECIMALS
    return { ok: true, amountUsd, paymentId: data.paymentId }
  } catch (err) {
    return { ok: false, amountUsd: 0, error: err instanceof Error ? err.message : 'settle_error' }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const paymentHeader =
    (req.headers['x-402-payment'] as string | undefined) ??
    (req.headers['x-payment'] as string | undefined)

  const body = (req.body ?? {}) as {
    address?: string
    sessionToken?: string
    txHash?: string
    amountUsd?: number
  }

  // ——— V1: on-chain USDC transfer settle ———
  if (body.txHash) {
    if (!x402KvConfigured()) return res.status(503).json({ error: 'x402_kv_not_configured' })

    const sessionAddr = await verifySessionToken(body.sessionToken)
    if (!sessionAddr) return res.status(401).json({ error: 'invalid_session' })

    const address = (body.address ?? '').trim().toLowerCase()
    if (!address || address !== sessionAddr) {
      return res.status(403).json({ error: 'address_mismatch' })
    }

    const amountUsd = Number(body.amountUsd)
    const min = minTopUpUsd()
    if (!Number.isFinite(amountUsd) || amountUsd < min) {
      return res.status(400).json({ error: 'below_minimum', minUsd: min })
    }

    const txHash = body.txHash.trim()
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return res.status(400).json({ error: 'invalid_tx_hash' })
    }

    const claimed = await claimTopUpTx(txHash)
    if (!claimed) return res.status(409).json({ error: 'tx_already_credited' })

    try {
      const verified = await verifyUsdcTransfer({
        txHash,
        from: address,
        minAmountUsd: amountUsd,
      })
      // Credit the requested amount (not more than verified — user asked for N).
      const creditAmount = Math.min(verified.amountUsd, amountUsd)
      const newBalance = await creditTopUp(address, creditAmount)
      return res.status(200).json({
        success: true,
        data: {
          walletAddress: address,
          amountCredited: creditAmount,
          newBalance,
          paymentId: txHash,
        },
      })
    } catch (err) {
      await releaseTopUpTx(txHash)
      const message = err instanceof Error ? err.message : 'verify_failed'
      const status =
        message === 'amount_below_requested' || message === 'tx_failed' ? 400 : 502
      return res.status(status).json({ error: 'x402_tx_verify_failed', message })
    }
  }

  // ——— Discovery: no payment header, no txHash ———
  if (!paymentHeader) {
    const suggested = Math.max(minTopUpUsd(), 10)
    return res.status(402).json(buildPaymentRequired(suggested))
  }

  // ——— Optional facilitator settlement ———
  if (!x402KvConfigured()) return res.status(503).json({ error: 'x402_kv_not_configured' })

  const address = body.address?.trim()
  if (!address) return res.status(400).json({ error: 'missing_address' })

  const settled = await settleViaFacilitator(paymentHeader)
  if (!settled.ok) {
    const status = settled.error === 'facilitator_not_configured' ? 501 : 402
    return res.status(status).json({ error: settled.error ?? 'settlement_failed' })
  }
  if (settled.amountUsd < minTopUpUsd()) {
    return res.status(400).json({ error: 'below_minimum', minUsd: minTopUpUsd() })
  }

  try {
    const newBalance = await creditTopUp(address, settled.amountUsd)
    return res.status(200).json({
      success: true,
      data: {
        walletAddress: address,
        amountCredited: settled.amountUsd,
        newBalance,
        paymentId: settled.paymentId ?? null,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'credit_failed'
    return res.status(502).json({ error: 'x402_credit_failed', message })
  }
}
