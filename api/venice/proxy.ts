// ANY /api/venice/proxy/<venice-path>?<query>
// Server-side pass-through to the Venice API for the shared, app-owner key. The
// browser calls this with NO key; we attach `Authorization: Bearer
// VENICE_API_KEY` here, so the key never touches client JS. This mirrors the X
// proxy and lets the app owner "front" Venice inference for all users.
//
// A vercel.json rewrite maps /api/venice/proxy/<path> → /api/venice/proxy?path=<path>.
// The raw request body is streamed through untouched (bodyParser disabled) so
// JSON, multipart uploads (image edit / transcription) all work; the upstream
// response is streamed back so chat SSE and binary (image/audio/video) work too.
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { api: { bodyParser: false } }

const VENICE_API_BASE = 'https://api.venice.ai/api/v1'

const STRIP_REQUEST = new Set(['host', 'authorization', 'cookie', 'content-length', 'connection'])
const STRIP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection'])

function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = process.env.VENICE_API_KEY
  if (!key) return res.status(500).json({ error: 'VENICE_API_KEY is not configured' })

  const segments = req.query.path
  const path = (Array.isArray(segments) ? segments.join('/') : String(segments ?? '')).replace(/^\/+/, '')
  if (!path) return res.status(400).json({ error: 'missing_path' })

  const url = new URL(`${VENICE_API_BASE}/${path}`)
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue
    if (Array.isArray(v)) v.forEach((val) => url.searchParams.append(k, val))
    else if (v != null) url.searchParams.set(k, v)
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` }
  for (const [k, v] of Object.entries(req.headers)) {
    if (STRIP_REQUEST.has(k.toLowerCase())) continue
    const val = firstHeader(v)
    if (val != null) headers[k] = val
  }

  const method = (req.method ?? 'GET').toUpperCase()
  let body: Buffer | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    body = chunks.length ? Buffer.concat(chunks) : undefined
  }

  let upstream: Response
  try {
    upstream = await fetch(url.toString(), { method, headers, body })
  } catch {
    return res.status(502).json({ error: 'venice_upstream_unreachable' })
  }

  res.status(upstream.status)
  upstream.headers.forEach((value, name) => {
    if (STRIP_RESPONSE.has(name.toLowerCase())) return
    res.setHeader(name, value)
  })

  if (!upstream.body) return res.end()

  const reader = upstream.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
  } finally {
    res.end()
  }
}
