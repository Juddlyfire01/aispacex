import { XMLParser } from 'fast-xml-parser'
import type { NewsFeed, NewsItem } from './types'
import { stripHtml, truncate, hashId, extractImageUrl, toIso, stripLinkAggregatorMeta } from './normalize'

const SUMMARY_MAX = 400

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
})

type Dict = Record<string, unknown>
const asArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])

function text(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object' && '#text' in (v as Dict)) return String((v as Dict)['#text'] ?? '')
  return String(v)
}

function atomLink(entry: Dict): string {
  const link = entry.link
  if (typeof link === 'string') return link
  for (const l of asArray<Dict>(link as Dict | Dict[] | undefined)) {
    const rel = l['@_rel']
    if (!rel || rel === 'alternate') return String(l['@_href'] ?? '')
  }
  const first = asArray<Dict>(link as Dict | Dict[] | undefined)[0]
  return first ? String(first['@_href'] ?? '') : ''
}

function imageFrom(node: Dict, descHtml: string): string | undefined {
  const enclosure = node.enclosure as Dict | undefined
  if (enclosure && String(enclosure['@_type'] ?? '').startsWith('image')) {
    return String(enclosure['@_url'] ?? '') || undefined
  }
  const media = (node['media:content'] ?? node['media:thumbnail']) as Dict | Dict[] | undefined
  const m = asArray<Dict>(media)[0]
  if (m?.['@_url']) return String(m['@_url'])
  return extractImageUrl(descHtml)
}

function build(feed: NewsFeed, title: string, url: string, descHtml: string, dateRaw: string, node: Dict): NewsItem | null {
  const cleanUrl = url.trim()
  const cleanTitle = stripHtml(title)
  if (!cleanUrl || !cleanTitle) return null
  return {
    id: hashId(cleanUrl),
    feedId: feed.id,
    category: feed.category,
    sourceName: feed.name,
    title: cleanTitle,
    summary: truncate(stripLinkAggregatorMeta(stripHtml(descHtml)), SUMMARY_MAX),
    url: cleanUrl,
    imageUrl: imageFrom(node, descHtml),
    publishedAt: toIso(dateRaw),
  }
}

export function parseFeed(xml: string, feed: NewsFeed): NewsItem[] {
  let doc: Dict
  try {
    doc = parser.parse(xml) as Dict
  } catch {
    return []
  }

  const items: NewsItem[] = []

  // RSS 2.0
  const channel = (doc.rss as Dict | undefined)?.channel as Dict | undefined
  if (channel) {
    for (const it of asArray<Dict>(channel.item as Dict | Dict[] | undefined)) {
      const descHtml = text(it['content:encoded']) || text(it.description)
      const built = build(feed, text(it.title), text(it.link), descHtml, text(it.pubDate), it)
      if (built) items.push(built)
    }
    return items
  }

  // Atom
  const atom = doc.feed as Dict | undefined
  if (atom) {
    for (const e of asArray<Dict>(atom.entry as Dict | Dict[] | undefined)) {
      const descHtml = text(e.content) || text(e.summary)
      const dateRaw = text(e.updated) || text(e.published)
      const built = build(feed, text(e.title), atomLink(e), descHtml, dateRaw, e)
      if (built) items.push(built)
    }
    return items
  }

  return []
}
