// /api/x402/charge
//   POST { sessionToken, rawUsd, action?, requestId? }
//     → 200 { ok, chargedUsd, balanceAfterUsd }
//     → 402 { error:'insufficient_funds', chargedUsd, balanceUsd } when too low
//
// The RECONCILE→DEBIT step of the charge flow. The client meters raw cost per
// action into the unified ledger, then posts the reconciled rawUsd here. The
// server is authoritative for the margin and the balance: it computes
// charged = rawUsd * margin and debits the wallet's credit balance.
//
// Auth is the session token issued by /api/x402/balance after one SIWE sign —
// no per-action wallet prompt. The token binds the address; Redis tracks
// whether the session is still active (revoked on Disconnect).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  chargedUsd,
  debitCharge,
  getBalanceUsd,
  verifySessionToken,
  x402KvConfigured,
} from '../_lib/x402.js'
import { addEstimatedCost } from '../_lib/reconcile.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  if (!x402KvConfigured()) return res.status(503).json({ error: 'x402_kv_not_configured' })

  const body = (req.body ?? {}) as {
    sessionToken?: string
    rawUsd?: number
    action?: string
    requestId?: string
    /** Optional raw cost split by provider — feeds daily reconciliation. */
    rawByProvider?: { venice?: number; x?: number }
  }

  const address = await verifySessionToken(body.sessionToken)
  if (!address) return res.status(401).json({ error: 'invalid_session' })

  const rawUsd = Number(body.rawUsd)
  if (!Number.isFinite(rawUsd) || rawUsd < 0) {
    return res.status(400).json({ error: 'invalid_raw_usd' })
  }

  // Accumulate the estimate denominator for reconciliation (best-effort).
  if (body.rawByProvider) {
    const { venice, x } = body.rawByProvider
    await Promise.all([
      venice ? addEstimatedCost('venice', Number(venice)) : Promise.resolve(),
      x ? addEstimatedCost('x', Number(x)) : Promise.resolve(),
    ])
  }

  const charged = chargedUsd(rawUsd)
  if (charged <= 0) {
    // Nothing to charge (zero-cost action). Report current balance.
    const balanceAfterUsd = await getBalanceUsd(address)
    return res.status(200).json({ ok: true, chargedUsd: 0, balanceAfterUsd })
  }

  try {
    const result = await debitCharge(address, charged, body.action, body.requestId)
    if (!result.ok) {
      return res.status(402).json({
        error: 'insufficient_funds',
        chargedUsd: charged,
        balanceUsd: result.balanceAfterUsd,
      })
    }
    res.setHeader('cache-control', 'no-store')
    return res.status(200).json({
      ok: true,
      chargedUsd: charged,
      balanceAfterUsd: result.balanceAfterUsd,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'charge_failed'
    return res.status(502).json({ error: 'x402_charge_failed', message })
  }
}
