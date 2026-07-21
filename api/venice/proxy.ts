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

// Domains the download relay is allowed to fetch. Venice returns fully-qualified
// signed download_url / video_url / audio_url links for VPS-backed jobs; the
// browser can't fetch them cross-origin (no CORS), so we relay same-origin.
// Restrict to Venice-owned hosts so the relay can't be used as an open proxy.
const RELAY_HOSTS = /(^|\.)(venice\.ai|veniceai\.com)$|^cdn\.venice\./i

function isRelayAllowed(url: URL): boolean {
  if (url.protocol !== 'https:') return false
  return RELAY_HOSTS.test(url.hostname)
}

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

  // Download relay: GET /api/venice/proxy/download?url=<encoded signed URL>.
  // VPS-backed video/audio return a storage download_url the browser can't fetch
  // cross-origin (no CORS). We fetch it server-side and stream bytes back so the
  // client can GET it same-origin. Reserved segment: no Venice API path is "download".
  if (path === 'download') {
    return relayDownload(req, res)
  }

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
  // Uint8Array (ArrayBufferView) is accepted by both Node and DOM BodyInit.
  // Plain Buffer is rejected by some undici/DOM RequestInit overloads on Vercel.
  let body: Uint8Array | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array))
    }
    if (chunks.length) {
      const buf = Buffer.concat(chunks)
      body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    }
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
  return streamBody(res, upstream.body)
}

/** Forward an upstream byte stream to the client with backpressure. */
async function streamBody(res: VercelResponse, body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
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

/**
 * Relay a signed VPS download URL (video_url / audio_url / download_url) so the
 * browser can fetch it same-origin. No auth header is attached — the URL's own
 * signature is the credential — but the target host is allow-listed to Venice
 * domains so the relay can't proxy arbitrary URLs.
 */
async function relayDownload(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.url
  const target = Array.isArray(raw) ? raw[0] : raw
  if (!target) return res.status(400).json({ error: 'missing_url' })

  let url: URL
  try {
    url = new URL(target)
  } catch {
    return res.status(400).json({ error: 'invalid_url' })
  }
  if (!isRelayAllowed(url)) {
    return res.status(403).json({ error: 'relay_host_not_allowed', host: url.hostname })
  }

  let upstream: Response
  try {
    upstream = await fetch(url.toString(), { headers: { 'accept-encoding': 'identity' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(502).json({ error: 'relay_upstream_unreachable', message })
  }
  if (!upstream.ok) {
    try { await upstream.arrayBuffer() } catch { /* drain */ }
    return res.status(upstream.status).json({ error: 'relay_upstream_error', status: upstream.status })
  }

  res.status(upstream.status)
  const ct = upstream.headers.get('content-type')
  if (ct) res.setHeader('content-type', ct)
  const len = upstream.headers.get('content-length')
  if (len) res.setHeader('content-length', len)

  if (!upstream.body) return res.end()
  return streamBody(res, upstream.body)
}
