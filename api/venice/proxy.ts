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

// Only forward headers Venice needs. Copying the browser bag (accept-encoding,
// origin, sec-fetch-*, transfer-encoding, …) breaks Node fetch / SSE under the
// in-process Vite API and is unnecessary on Vercel too.
const FORWARD_REQUEST = new Set(['content-type', 'accept', 'accept-language'])
const STRIP_RESPONSE = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
])

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

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    // Undici decompresses gzip/br; force identity so SSE bytes stay intact.
    'accept-encoding': 'identity',
  }
  for (const [k, v] of Object.entries(req.headers)) {
    if (!FORWARD_REQUEST.has(k.toLowerCase())) continue
    const val = firstHeader(v)
    if (val != null) headers[k] = val
  }
  if (!headers.accept) headers.accept = 'application/json, text/event-stream'

  const method = (req.method ?? 'GET').toUpperCase()
  // Uint8Array (not Buffer) so fetch BodyInit types accept the body under Vercel's NodeNext check.
  let body: Uint8Array | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    body = chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined
  }

  let upstream: Response
  try {
    upstream = await fetch(url.toString(), { method, headers, body })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(502).json({ error: 'venice_upstream_unreachable', message })
  }

  res.status(upstream.status)
  upstream.headers.forEach((value, name) => {
    if (STRIP_RESPONSE.has(name.toLowerCase())) return
    res.setHeader(name, value)
  })
  // SSE / long streams: push headers immediately so the browser EventStream
  // panel and fetch readers see bytes as they arrive.
  const contentType = upstream.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) {
    res.setHeader('cache-control', 'no-cache, no-transform')
    res.setHeader('x-accel-buffering', 'no')
    if (typeof (res as { flushHeaders?: () => void }).flushHeaders === 'function') {
      ;(res as { flushHeaders: () => void }).flushHeaders()
    }
  }

  if (!upstream.body) return res.end()

  const reader = upstream.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const ok = res.write(Buffer.from(value))
      // Backpressure: wait for drain so we don't buffer the entire stream in memory.
      if (!ok) {
        await new Promise<void>((resolve) => res.once('drain', resolve))
      }
    }
  } catch (err) {
    // Client aborted mid-stream — normal for stop/remount; don't throw 500.
    if (!res.writableEnded) {
      try {
        res.end()
      } catch {
        /* already closed */
      }
    }
    void err
    return
  } finally {
    if (!res.writableEnded) res.end()
  }
}
