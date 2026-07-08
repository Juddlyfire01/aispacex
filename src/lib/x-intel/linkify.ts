/**
 * Split a bio / free-text string into typed tokens so the UI can render URLs,
 * @mentions and #hashtags as interactive elements while leaving plain text alone.
 *
 * Kept framework-agnostic (returns data, not JSX) so it is unit-testable in
 * isolation. Rendering + safety (protocol allow-listing) is the caller's job.
 *
 * URL labels follow X display requirements: use `display_url` from API
 * entities when available; otherwise strip protocol/www for plain URLs.
 */
import { etherscanAddressUrl } from './etherscan'
export type LinkToken =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string; href: string }
  | { type: 'mention'; value: string; username: string }
  | { type: 'hashtag'; value: string; tag: string }
  | { type: 'eth'; value: string; href: string }

export type BioUrlEntity = {
  url: string
  expanded: string
  display: string
  start?: number
  end?: number
}

// Ethereum identity fragments shared with the Etherscan link builder. Kept
// inline (rather than imported) so the alternation indices stay obvious, but
// intentionally mirrors src/lib/x-intel/etherscan.ts.
const ETH_ADDRESS = '0x[a-fA-F0-9]{40}'
const ENS_NAME = '(?:[a-zA-Z0-9-]+\\.)+eth'

// @handles (1–15 word chars, X's limit), #hashtags, ETH addresses, .eth names
// — used inside plain segments. Groups: 1=mention 2=hashtag 3=address 4=ens.
const INLINE_RE = new RegExp(
  `(?:^|(?<=[\\s(]))@(\\w{1,15})\\b|(?:^|(?<=[\\s(]))#(\\w+)|\\b(${ETH_ADDRESS})\\b|\\b(${ENS_NAME})\\b`,
  'g',
)

// Full-string scan including bare URLs (fallback when entity indices are
// absent). Groups: 1=url 2=mention 3=hashtag 4=address 5=ens.
const TOKEN_RE = new RegExp(
  `(https?:\\/\\/[^\\s]+)|(?:^|(?<=[\\s(]))@(\\w{1,15})\\b|(?:^|(?<=[\\s(]))#(\\w+)|\\b(${ETH_ADDRESS})\\b|\\b(${ENS_NAME})\\b`,
  'g',
)

/** Fallback label when no X entity metadata is available. */
export function condenseUrlLabel(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 't.co' || host === 'x.co') return url
    const path = u.pathname === '/' ? '' : u.pathname
    return `${host}${path}${u.search}`
  } catch {
    return url
  }
}

function findBioUrlEntity(trimmed: string, bioUrls: BioUrlEntity[]): BioUrlEntity | undefined {
  const norm = trimmed.replace(/[.,;:!?)\]]+$/, '')
  return bioUrls.find((u) => u.url === norm || u.url === trimmed)
}

function linkifyPlainSegment(segment: string, bioUrls: BioUrlEntity[]): LinkToken[] {
  const tokens: LinkToken[] = []
  let lastIndex = 0
  for (const m of segment.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0
    if (idx > lastIndex) tokens.push({ type: 'text', value: segment.slice(lastIndex, idx) })
    if (m[1]) tokens.push({ type: 'mention', value: `@${m[1]}`, username: m[1] })
    else if (m[2]) tokens.push({ type: 'hashtag', value: `#${m[2]}`, tag: m[2] })
    else if (m[3]) tokens.push({ type: 'eth', value: m[3], href: etherscanAddressUrl(m[3]) })
    else if (m[4]) tokens.push({ type: 'eth', value: m[4], href: etherscanAddressUrl(m[4]) })
    lastIndex = idx + m[0].length
  }
  if (lastIndex < segment.length) {
    const rest = segment.slice(lastIndex)
    // Plain segment may still contain a URL if entity indices were incomplete.
    if (/https?:\/\//.test(rest)) tokens.push(...linkifyRegex(rest, bioUrls))
    else tokens.push({ type: 'text', value: rest })
  }
  return tokens
}

function linkifyRegex(text: string, bioUrls: BioUrlEntity[]): LinkToken[] {
  const tokens: LinkToken[] = []
  let lastIndex = 0
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0
    if (idx > lastIndex) tokens.push({ type: 'text', value: text.slice(lastIndex, idx) })

    if (m[1]) {
      const raw = m[1]
      const trimmed = raw.replace(/[.,;:!?)\]]+$/, '')
      const trailing = raw.slice(trimmed.length)
      const ent = findBioUrlEntity(trimmed, bioUrls)
      tokens.push(
        ent
          ? { type: 'url', value: ent.display, href: ent.url }
          : { type: 'url', value: condenseUrlLabel(trimmed), href: trimmed },
      )
      if (trailing) tokens.push({ type: 'text', value: trailing })
    } else if (m[2]) {
      tokens.push({ type: 'mention', value: `@${m[2]}`, username: m[2] })
    } else if (m[3]) {
      tokens.push({ type: 'hashtag', value: `#${m[3]}`, tag: m[3] })
    } else if (m[4]) {
      tokens.push({ type: 'eth', value: m[4], href: etherscanAddressUrl(m[4]) })
    } else if (m[5]) {
      tokens.push({ type: 'eth', value: m[5], href: etherscanAddressUrl(m[5]) })
    }
    lastIndex = idx + m[0].length
  }
  if (lastIndex < text.length) tokens.push({ type: 'text', value: text.slice(lastIndex) })
  return tokens
}

function linkifyWithEntitySpans(text: string, bioUrls: BioUrlEntity[]): LinkToken[] {
  const spans = bioUrls
    .filter((u) => u.start != null && u.end != null && u.end! > u.start!)
    .sort((a, b) => a.start! - b.start!)

  const tokens: LinkToken[] = []
  let cursor = 0
  for (const ent of spans) {
    const start = ent.start!
    const end = Math.min(ent.end!, text.length)
    if (start > cursor) tokens.push(...linkifyPlainSegment(text.slice(cursor, start), bioUrls))
    tokens.push({ type: 'url', value: ent.display, href: ent.url })
    cursor = end
  }
  if (cursor < text.length) tokens.push(...linkifyPlainSegment(text.slice(cursor), bioUrls))
  return tokens
}

export function linkify(text: string, bioUrls: BioUrlEntity[] = []): LinkToken[] {
  const hasSpans = bioUrls.some((u) => u.start != null && u.end != null)
  if (hasSpans) return linkifyWithEntitySpans(text, bioUrls)
  return linkifyRegex(text, bioUrls)
}
