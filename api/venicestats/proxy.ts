// ANY /api/venicestats/proxy/<path>?<query>
// Pass-through to the public VeniceStats REST API (no auth). Keeps the browser
// off venicestats.com directly so CORS never blocks Intel → Stats in prod.
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { api: { bodyParser: false } }

const VENICESTATS_BASE = 'https://venicestats.com'

const STRIP_REQUEST = new Set(['host', 'cookie', 'content-length', 'connection', 'accept-encoding'])

function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = req.query.path
  const path = (Array.isArray(segments) ? segments.join('/') : String(segments ?? '')).replace(/^\/+/, '')
  if (!path) return res.status(400).json({ error: 'missing_path' })

  const url = new URL(`${VENICESTATS_BASE}/${path}`)
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue
    if (Array.isArray(v)) v.forEach((val) => url.searchParams.append(k, val))
    else if (v != null) url.searchParams.set(k, v)
  }

  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (STRIP_REQUEST.has(k.toLowerCase())) continue
    const val = firstHeader(v)
    if (val) headers.set(k, val)
  }
  headers.set('user-agent', 'AiSpaceX/1.0 (VeniceStats proxy)')
  headers.set('accept', 'application/json')
  headers.set('accept-encoding', 'identity')

  try {
    const upstream = await fetch(url.toString(), {
      method: req.method ?? 'GET',
      headers,
      signal: AbortSignal.timeout(20_000),
    })

    const buf = Buffer.from(await upstream.arrayBuffer())

    res.status(upstream.status)
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')
    res.setHeader('cache-control', upstream.headers.get('cache-control') ?? 'no-cache')
    return res.send(buf)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'proxy_failed'
    return res.status(502).json({ error: msg })
  }
}
