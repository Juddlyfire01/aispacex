// POST /api/news/extract  { url: string }
// Fetches the page HTML and returns Readability main-article text (full story).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  ARTICLE_SAFETY_MAX_CHARS,
  extractArticleFromHtml,
} from '../../src/lib/news/readability-extract.js'

const FETCH_TIMEOUT_MS = 15_000
const HTML_BYTE_CAP = 2_500_000

function isAllowedUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return null
  }
  return u
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const urlRaw = typeof body.url === 'string' ? body.url.trim() : ''
  const parsed = isAllowedUrl(urlRaw)
  if (!parsed) return res.status(400).json({ error: 'invalid_url' })

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'user-agent': 'Xintel/1.0 (+article extract)',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-encoding': 'identity',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!upstream.ok) {
      return res.status(502).json({ error: `http_${upstream.status}`, url: parsed.toString() })
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    if (buf.byteLength > HTML_BYTE_CAP) {
      return res.status(413).json({ error: 'html_too_large', url: parsed.toString() })
    }

    const html = buf.toString('utf8')
    const result = extractArticleFromHtml(html, parsed.toString())
    if (result.ok === false) {
      return res.status(422).json({
        error: result.reason,
        url: parsed.toString(),
        safetyMaxChars: ARTICLE_SAFETY_MAX_CHARS,
      })
    }

    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'private, max-age=300')
    return res.status(200).json({
      url: parsed.toString(),
      ...result.article,
    })
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === 'TimeoutError'
          ? 'timeout'
          : err.message
        : 'fetch_failed'
    return res.status(502).json({ error: msg, url: parsed.toString() })
  }
}
