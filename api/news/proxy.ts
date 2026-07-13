// GET /api/news/proxy?feeds=<id1>,<id2>,...
// Fetches curated RSS/Atom feeds by ID (never raw URLs — no open relay),
// parses to normalized NewsItem[], returns { items, failures }.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getFeed } from '../../src/lib/news/feeds.js'
import { parseFeed } from '../../src/lib/news/parse.js'
import type { NewsItem, NewsFeedFailure } from '../../src/lib/news/types.js'

const PER_FEED_TIMEOUT_MS = 8_000

function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = firstHeader(req.query.feeds as string | string[] | undefined) ?? ''
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) return res.status(400).json({ error: 'missing_feeds' })

  const items: NewsItem[] = []
  const failures: NewsFeedFailure[] = []

  await Promise.all(
    ids.map(async (id) => {
      const feed = getFeed(id)
      if (!feed) {
        failures.push({ feedId: id, error: 'unknown_feed' })
        return
      }
      try {
        const upstream = await fetch(feed.url, {
          headers: {
            'user-agent': 'IntelX/1.0 (+news reader)',
            accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
            'accept-encoding': 'identity',
          },
          signal: AbortSignal.timeout(PER_FEED_TIMEOUT_MS),
        })
        if (!upstream.ok) {
          failures.push({ feedId: id, error: `http_${upstream.status}` })
          return
        }
        const xml = await upstream.text()
        const parsed = parseFeed(xml, feed)
        if (parsed.length === 0) failures.push({ feedId: id, error: 'empty_or_unparseable' })
        items.push(...parsed)
      } catch (err) {
        const msg = err instanceof Error ? (err.name === 'TimeoutError' ? 'timeout' : err.message) : 'fetch_failed'
        failures.push({ feedId: id, error: msg })
      }
    }),
  )

  // Dedupe by URL, sort newest-first (missing dates sort last).
  const seen = new Set<string>()
  const deduped = items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
  deduped.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0
    return tb - ta
  })

  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 's-maxage=180, stale-while-revalidate=60')
  return res.status(200).json({ items: deduped, failures })
}
