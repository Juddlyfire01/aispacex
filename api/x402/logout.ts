// /api/x402/logout
//   POST { sessionToken } → { ok: true }
//
// Server-side session revoke: deletes the Redis session so the token can no
// longer charge/top-up. Client calls this on Credits Disconnect.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { revokeSessionToken, x402KvConfigured } from '../_lib/x402.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  if (!x402KvConfigured()) return res.status(503).json({ error: 'x402_kv_not_configured' })

  const body = (req.body ?? {}) as { sessionToken?: string }
  const ok = await revokeSessionToken(body.sessionToken)
  res.setHeader('cache-control', 'no-store')
  // Always 200 — local disconnect should succeed even if the token was already gone.
  return res.status(200).json({ ok: true, revoked: ok })
}
