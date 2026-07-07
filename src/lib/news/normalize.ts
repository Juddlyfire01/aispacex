const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
}

export function stripHtml(input: string): string {
  if (!input) return ''
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input
  const slice = input.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice
  return `${cut.trimEnd()}…`
}

/** Small, stable, non-crypto hash (djb2) rendered base36 — stable IDs for React keys. */
export function hashId(url: string): string {
  let h = 5381
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function extractImageUrl(html: string | undefined): string | undefined {
  if (!html) return undefined
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m?.[1]
}

export function toIso(raw: string | undefined): string {
  if (!raw) return ''
  const t = Date.parse(raw)
  return Number.isFinite(t) ? new Date(t).toISOString() : ''
}

// Link-aggregator feeds (Hacker News via hnrss.org, and similar "submission
// link" style feeds) don't provide a real article excerpt — their
// <description> is synthesized bookkeeping metadata instead, e.g.:
//   "Article URL: https://... Comments URL: https://... Points: 165 # Comments: 57"
// Left as-is, that metadata gets displayed as if it were the article summary
// (meaningless to a reader) and can leak into the TL;DR fallback source when
// scraping fails. Strip it out; if nothing meaningful remains, the caller
// gets an empty string and the summary UI is simply omitted.
const LINK_AGGREGATOR_META = [
  /Article URL:\s*\S+/gi,
  /Comments? URL:\s*\S+/gi,
  /Points:\s*\d+/gi,
  /#\s*Comments:\s*\d+/gi,
]

export function stripLinkAggregatorMeta(input: string): string {
  if (!input) return ''
  let out = input
  for (const re of LINK_AGGREGATOR_META) out = out.replace(re, ' ')
  return out.replace(/\s+/g, ' ').trim()
}
