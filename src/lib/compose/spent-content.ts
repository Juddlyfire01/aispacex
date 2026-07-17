import type { IntelSnapshot } from '../intel-library/types'
import type { Post } from '../x-intel/types'
import type { HistorySnapshot } from './history-library'
import { estimateTokens } from './token-estimate'

/** Soft budget for the SPENT / PRIOR ART inject (~3k tokens). */
export const SPENT_TOKEN_BUDGET = 3000

const OWN_KINDS = new Set<Post['kind']>(['original', 'quote', 'reply'])

export interface BuildSpentContentPackOpts {
  snapshot: IntelSnapshot
  history: HistorySnapshot
  currentDraftText?: string | null
  tokenBudget?: number
}

interface SpentItem {
  sortKey: string
  block: string
}

function openingLine(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ''
  return line.length > 160 ? `${line.slice(0, 157)}…` : line
}

/** Normalize short slogan-like phrases (2–8 words, repeated emphasis). */
function extractSlogans(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/[.!?\n]+/)) {
    const s = raw.replace(/\s+/g, ' ').trim()
    if (!s) continue
    const words = s.split(' ').filter(Boolean)
    if (words.length < 2 || words.length > 8) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= 3) break
  }
  return out
}

function statusIdsFromText(text: string): string[] {
  const ids = new Set<string>()
  for (const m of text.matchAll(/https?:\/\/(?:x|twitter)\.com\/(?:i\/status|[^/\s]+\/status)\/(\d{5,})/gi)) {
    if (m[1]) ids.add(m[1])
  }
  for (const m of text.matchAll(/\b(?:post:)?(\d{15,})\b/g)) {
    if (m[1]) ids.add(m[1])
  }
  return [...ids].slice(0, 8)
}

function cashtagHandleStacks(text: string): string[] {
  const tags = [...text.matchAll(/\$[A-Za-z]{2,10}/g)].map((m) => m[0])
  const handles = [...text.matchAll(/@[A-Za-z0-9_]{2,15}/g)].map((m) => m[0])
  const stacks: string[] = []
  if (tags.length >= 2) stacks.push(`cashtags: ${[...new Set(tags)].slice(0, 8).join(' ')}`)
  if (handles.length >= 3) stacks.push(`handles: ${[...new Set(handles)].slice(0, 8).join(' ')}`)
  return stacks
}

function fingerprintBlock(label: string, text: string, meta?: string): string {
  const open = openingLine(text)
  const slogans = extractSlogans(text)
  const ids = statusIdsFromText(text)
  const stacks = cashtagHandleStacks(text)
  const lines = [`- ${label}${meta ? ` (${meta})` : ''}`]
  if (open) lines.push(`  opener: ${open}`)
  if (slogans.length) lines.push(`  slogans: ${slogans.join(' | ')}`)
  if (ids.length) lines.push(`  ids: ${ids.join(', ')}`)
  for (const s of stacks) lines.push(`  ${s}`)
  const excerpt = text.replace(/\s+/g, ' ').trim()
  if (excerpt) {
    lines.push(`  text: ${excerpt.length > 220 ? `${excerpt.slice(0, 217)}…` : excerpt}`)
  }
  return lines.join('\n')
}

function selfPostsNewestFirst(snapshot: IntelSnapshot): Post[] {
  const posts: Post[] = []
  for (const sub of snapshot.subjects) {
    if (sub.kind !== 'self') continue
    for (const p of sub.posts) {
      if (!OWN_KINDS.has(p.kind)) continue
      if (!p.text?.trim()) continue
      posts.push(p)
    }
  }
  posts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return posts
}

function historyDraftItems(history: HistorySnapshot): SpentItem[] {
  const items: SpentItem[] = []
  // history.threads is newest-first preferred
  for (const t of history.threads) {
    const draft = t.draft
    if (!draft) continue
    const parts: string[] = []
    for (const seg of draft.segments ?? []) {
      if (seg.text?.trim()) parts.push(seg.text.trim())
    }
    const art = draft.article
    if (art) {
      const title = art.title?.trim()
      const body = art.bodyMarkdown?.trim()
      if (title || body) {
        parts.push([title, body].filter(Boolean).join('\n\n'))
      }
    }
    const text = parts.join('\n---\n').trim()
    if (!text) continue
    items.push({
      sortKey: t.updatedAt || t.createdAt || '',
      block: fingerprintBlock(`draft:${t.id}`, text, t.title || 'compose draft'),
    })
  }
  items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
  return items
}

/**
 * Budgeted SPENT / PRIOR ART pack from own posts, recent compose drafts, and
 * optional current drawer text. Newest-first; trims to tokenBudget.
 */
export function buildSpentContentPack(opts: BuildSpentContentPackOpts): {
  text: string
  estimatedTokens: number
} {
  const budget = opts.tokenBudget ?? SPENT_TOKEN_BUDGET
  const items: SpentItem[] = []

  for (const p of selfPostsNewestFirst(opts.snapshot)) {
    items.push({
      sortKey: p.createdAt,
      block: fingerprintBlock(`post:${p.id}`, p.text, `${p.kind} ${p.createdAt.slice(0, 10)}`),
    })
  }

  items.push(...historyDraftItems(opts.history))

  // Re-sort all sources newest-first by sortKey
  items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))

  const current = opts.currentDraftText?.trim()
  if (current) {
    items.unshift({
      sortKey: '9999', // keep current draft first
      block: fingerprintBlock('currentDraft', current, 'drawer'),
    })
  }

  if (items.length === 0) {
    return { text: '', estimatedTokens: 0 }
  }

  const header = '## SPENT / PRIOR ART\nAlready-used openers, slogans, spines, and ids — do not reuse.'
  const kept: string[] = []
  let body = header
  for (const item of items) {
    const next = `${body}\n${item.block}`
    if (estimateTokens(next) > budget && kept.length > 0) break
    kept.push(item.block)
    body = next
  }

  const text = kept.length ? `${header}\n${kept.join('\n')}` : ''
  return { text, estimatedTokens: estimateTokens(text) }
}
