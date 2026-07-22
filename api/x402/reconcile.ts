// /api/x402/reconcile
//   GET → run the daily true-up (Venice + X actual vs app estimate), persist a
//         snapshot + true factors, and return the snapshot.
//
// Intended to be invoked by a Vercel Cron (see vercel.json "crons"). Protected
// by CRON_SECRET: Vercel sends `Authorization: Bearer $CRON_SECRET` on cron
// invocations. Manual calls must supply the same. When CRON_SECRET is unset
// (local dev) the guard is skipped.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { reconcileConfigured, runReconcile, readTrueFactors } from '../_lib/reconcile.js'

function authorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return true // dev / unconfigured — allow
  const auth = req.headers['authorization']
  return auth === `Bearer ${secret}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' })
  if (!reconcileConfigured()) return res.status(503).json({ error: 'reconcile_kv_not_configured' })

  try {
    const xUnitPriceUsd = Number(process.env.X402_X_UNIT_PRICE_USD) || undefined
    const snapshot = await runReconcile({ xUnitPriceUsd })
    const factors = await readTrueFactors()
    res.setHeader('cache-control', 'no-store')
    return res.status(200).json({ ok: true, snapshot, factors })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'reconcile_failed'
    return res.status(502).json({ error: 'x402_reconcile_failed', message })
  }
}
