// ANY /api/x/demo/<x-api-path>?<query>
// App-only bearer pass-through for the gratis @AskVenice demo target only.
// The browser never sends a token; we attach X_BEARER_TOKEN server-side.
//
// A vercel.json rewrite maps /api/x/demo/<path> → /api/x/demo?path=<path>.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { X_API_BASE } from '../_lib/x-oauth.js'
import { isDemoPathAllowed, readAppBearerToken, resolveDemoUserId } from '../_lib/x-demo.js'

const ALLOWED = new Set(['GET'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ALLOWED.has(req.method ?? 'GET')) {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const bearer = readAppBearerToken()
  if (!bearer) {
    return res.status(503).json({ error: 'x_demo_unconfigured' })
  }

  const segments = req.query.path
  const path = (Array.isArray(segments) ? segments.join('/') : String(segments ?? '')).replace(/^\/+/, '')
  if (!path) return res.status(400).json({ error: 'missing_path' })

  let demoUserId: string
  try {
    demoUserId = await resolveDemoUserId(bearer)
  } catch {
    return res.status(502).json({ error: 'demo_user_lookup_failed' })
  }

  if (!isDemoPathAllowed(path, demoUserId)) {
    return res.status(403).json({ error: 'demo_path_forbidden' })
  }

  const url = new URL(`${X_API_BASE}/${path}`)
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue
    if (Array.isArray(v)) v.forEach((val) => url.searchParams.append(k, val))
    else if (v != null) url.searchParams.set(k, v)
  }

  const xRes = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${bearer}` },
  })

  const bodyText = await xRes.text()
  res.status(xRes.status)
  res.setHeader('Content-Type', xRes.headers.get('content-type') ?? 'application/json')
  res.send(bodyText)
}
