// ANY /api/x/proxy/<x-api-path>?<query>
// Authenticated pass-through to the X API v2 for the OAuth-connected user. The
// browser calls this with NO token; we attach the user-context access token
// (refreshing if needed) server-side, so the token never touches client JS.
//
// A vercel.json rewrite maps /api/x/proxy/<path> → /api/x/proxy?path=<path>.
//
// Example: GET /api/x/proxy/users/me?user.fields=public_metrics,description
//          → GET https://api.x.com/2/users/me?user.fields=...
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { X_API_BASE } from '../_lib/x-oauth.js'
import { resolveSession, clearSessionCookies } from '../_lib/x-session.js'

// Only read methods are proxied in the prototype; writes would need write scopes.
const ALLOWED = new Set(['GET'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ALLOWED.has(req.method ?? 'GET')) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let session
  try {
    session = await resolveSession(req)
  } catch {
    clearSessionCookies(res)
    return res.status(401).json({ error: 'x_session_expired' })
  }
  if (!session) return res.status(401).json({ error: 'x_not_connected' })

  const segments = req.query.path
  const path = (Array.isArray(segments) ? segments.join('/') : String(segments ?? '')).replace(/^\/+/, '')
  if (!path) return res.status(400).json({ error: 'missing_path' })

  const url = new URL(`${X_API_BASE}/${path}`)
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue
    if (Array.isArray(v)) v.forEach((val) => url.searchParams.append(k, val))
    else if (v != null) url.searchParams.set(k, v)
  }

  const xRes = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })

  if (session.setCookies.length) res.setHeader('Set-Cookie', session.setCookies)

  const bodyText = await xRes.text()
  res.status(xRes.status)
  res.setHeader('Content-Type', xRes.headers.get('content-type') ?? 'application/json')
  res.send(bodyText)
}
