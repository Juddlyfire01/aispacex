// POST /api/x/byok — sync advanced-user X developer credentials into HttpOnly cookies
// DELETE /api/x/byok — clear those cookies (fall back to env)
//
// Client ID / Secret are used for OAuth; Bearer for public gather (/api/x/demo).
// Secrets are only held in HttpOnly cookies on this origin — not written to a DB.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  cookiesAreSecure,
  serializeByokCookies,
  clearByokCookies,
  type XByokCredentials,
} from '../_lib/x-oauth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method ?? 'GET').toUpperCase()

  if (method === 'DELETE') {
    res.setHeader('Set-Cookie', clearByokCookies())
    return res.status(200).json({ ok: true })
  }

  if (method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  let body: XByokCredentials = {}
  try {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
    body = raw as XByokCredentials
  } catch {
    return res.status(400).json({ error: 'invalid_json' })
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : ''
  const bearer = typeof body.bearer === 'string' ? body.bearer.trim() : ''

  // Allow clearing all by posting empty fields.
  const creds: XByokCredentials = {
    clientId: clientId || undefined,
    clientSecret: clientSecret || undefined,
    bearer: bearer || undefined,
  }

  res.setHeader('Set-Cookie', serializeByokCookies(creds, cookiesAreSecure(req)))
  return res.status(200).json({
    ok: true,
    hasClientId: Boolean(creds.clientId),
    hasClientSecret: Boolean(creds.clientSecret),
    hasBearer: Boolean(creds.bearer),
  })
}
