import {
  formatEdgeLine,
  formatPostLine,
  formatProfileLine,
  formatReportBrief,
} from '../intel-library/format'
import { subjectsInScope } from '../intel-library/library'
import type { ComposeScope, IntelSnapshot, LibrarySubject } from '../intel-library/types'
import type { Edge, IntelReportSnapshot, Post } from '../x-intel/types'
import { estimateTokens } from './token-estimate'

export type LibraryMode = 'auto' | 'custom'

export interface PackInput {
  snapshot: IntelSnapshot
  scope: ComposeScope
  mode: LibraryMode
  dayWindowDays: number | null // null = all time preference
  tokenBudget: number
  now?: Date
}

export interface PackResult {
  text: string
  estimatedTokens: number
  overBudget: boolean
  included: { posts: number; reports: number; subjects: number }
}

type BlockKind = 'bookmark' | 'report' | 'profile' | 'post' | 'edge'

interface PackBlock {
  subjectKey: string
  username: string
  kind: LibrarySubject['kind']
  blockKind: BlockKind
  text: string
  /** Global fill priority: lower number = higher rank (filled first). */
  rank: number
  /** Tie-break within same rank (higher = preferred). */
  score: number
}

function scopeLabel(scope: ComposeScope): string {
  switch (scope.type) {
    case 'all':
      return 'All'
    case 'me':
      return 'Me'
    case 'target':
      return `@${scope.username.replace(/^@/, '')}`
  }
}

function windowStartMs(dayWindowDays: number | null, now: Date): number | null {
  if (dayWindowDays === null) return null
  return now.getTime() - dayWindowDays * 24 * 60 * 60 * 1000
}

function isInWindow(iso: string, startMs: number | null): boolean {
  if (startMs === null) return true
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  return t >= startMs
}

function sortPostsNewestFirst(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const ta = Date.parse(a.createdAt)
    const tb = Date.parse(b.createdAt)
    if (tb !== ta) return tb - ta
    return (b.metrics?.likes ?? 0) - (a.metrics?.likes ?? 0)
  })
}

function latestReport(reports: IntelReportSnapshot[]): IntelReportSnapshot | null {
  if (reports.length === 0) return null
  return [...reports].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
}

function olderReports(reports: IntelReportSnapshot[], latest: IntelReportSnapshot | null): IntelReportSnapshot[] {
  if (!latest) return []
  return [...reports]
    .filter((r) => r.id !== latest.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

function topEdges(edges: Edge[], limit: number): Edge[] {
  return [...edges]
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight
      return Date.parse(b.lastSeen) - Date.parse(a.lastSeen)
    })
    .slice(0, limit)
}

function subjectHeading(sub: LibrarySubject): string {
  return `### @${sub.username} (${sub.kind})`
}

/**
 * Ranking for candidate blocks (highest first):
 * 1. bookmarks (self)
 * 2. latest report per subject
 * 3. profile line
 * 4. posts in day window (newest, soft likes tie-break)
 * 5. auto-only: older posts + older reports
 * 6. top edges (max 5 per subject) if room
 */
function collectBlocks(
  subjects: LibrarySubject[],
  dayWindowDays: number | null,
  now: Date,
  includeOlder: boolean,
): PackBlock[] {
  const startMs = windowStartMs(dayWindowDays, now)
  const blocks: PackBlock[] = []

  for (const sub of subjects) {
    const subjectKey = `${sub.kind}:${sub.username.toLowerCase()}`

    if (sub.kind === 'self' && sub.bookmarks.length > 0) {
      const sorted = sortPostsNewestFirst(sub.bookmarks)
      for (const p of sorted) {
        blocks.push({
          subjectKey,
          username: sub.username,
          kind: sub.kind,
          blockKind: 'bookmark',
          text: `Bookmarked:\n${formatPostLine(p)}`,
          rank: 1,
          score: Date.parse(p.createdAt) || 0,
        })
      }
    }

    const latest = latestReport(sub.reports)
    if (latest) {
      blocks.push({
        subjectKey,
        username: sub.username,
        kind: sub.kind,
        blockKind: 'report',
        text: formatReportBrief(latest),
        rank: 2,
        score: Date.parse(latest.createdAt) || 0,
      })
    }

    if (sub.profile) {
      blocks.push({
        subjectKey,
        username: sub.username,
        kind: sub.kind,
        blockKind: 'profile',
        text: formatProfileLine(sub.profile),
        rank: 3,
        score: 0,
      })
    }

    const inWindow = sortPostsNewestFirst(sub.posts.filter((p) => isInWindow(p.createdAt, startMs)))
    for (const p of inWindow) {
      blocks.push({
        subjectKey,
        username: sub.username,
        kind: sub.kind,
        blockKind: 'post',
        text: formatPostLine(p),
        rank: 4,
        score: (Date.parse(p.createdAt) || 0) + (p.metrics?.likes ?? 0) * 0.001,
      })
    }

    if (includeOlder) {
      const olderPosts = sortPostsNewestFirst(sub.posts.filter((p) => !isInWindow(p.createdAt, startMs)))
      for (const p of olderPosts) {
        blocks.push({
          subjectKey,
          username: sub.username,
          kind: sub.kind,
          blockKind: 'post',
          text: formatPostLine(p),
          rank: 5,
          score: (Date.parse(p.createdAt) || 0) + (p.metrics?.likes ?? 0) * 0.001,
        })
      }
      for (const r of olderReports(sub.reports, latest)) {
        blocks.push({
          subjectKey,
          username: sub.username,
          kind: sub.kind,
          blockKind: 'report',
          text: formatReportBrief(r),
          rank: 5,
          score: Date.parse(r.createdAt) || 0,
        })
      }
    }

    for (const e of topEdges(sub.edges, 5)) {
      blocks.push({
        subjectKey,
        username: sub.username,
        kind: sub.kind,
        blockKind: 'edge',
        text: formatEdgeLine(e),
        rank: 6,
        score: e.weight,
      })
    }
  }

  return blocks.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (b.score !== a.score) return b.score - a.score
    return a.username.localeCompare(b.username)
  })
}

function assembleText(scope: ComposeScope, selected: PackBlock[]): string {
  if (selected.length === 0) return ''

  const bySubject = new Map<string, { heading: string; lines: string[] }>()
  const order: string[] = []

  for (const b of selected) {
    if (!bySubject.has(b.subjectKey)) {
      order.push(b.subjectKey)
      bySubject.set(b.subjectKey, {
        heading: subjectHeading({ kind: b.kind, username: b.username } as LibrarySubject),
        lines: [],
      })
    }
    bySubject.get(b.subjectKey)!.lines.push(b.text)
  }

  const body = order
    .map((key) => {
      const g = bySubject.get(key)!
      return `${g.heading}\n${g.lines.join('\n')}`
    })
    .join('\n\n')

  return [
    `===== LOCAL INTEL (scope: ${scopeLabel(scope)}) =====`,
    body,
    '===== END · use tools for anything not above =====',
  ].join('\n')
}

function countIncluded(selected: PackBlock[]): PackResult['included'] {
  const subjects = new Set(selected.map((b) => b.subjectKey))
  let posts = 0
  let reports = 0
  for (const b of selected) {
    if (b.blockKind === 'post' || b.blockKind === 'bookmark') posts += 1
    if (b.blockKind === 'report') reports += 1
  }
  return { posts, reports, subjects: subjects.size }
}

function tryAdd(
  selected: PackBlock[],
  block: PackBlock,
  scope: ComposeScope,
  tokenBudget: number,
): boolean {
  const next = [...selected, block]
  const text = assembleText(scope, next)
  return estimateTokens(text) <= tokenBudget
}

/**
 * Pack a budgeted hot window of local intel for the compose agent.
 *
 * Auto: add blocks while estimateTokens(joined) <= budget; drop lowest priority.
 * Custom: required set = bookmarks + latest report + profile + window posts;
 *   if over budget, overBudget=true and still return full required text for the meter.
 */
export function packHotWindow(input: PackInput): PackResult {
  const { snapshot, scope, mode, dayWindowDays, tokenBudget } = input
  const now = input.now ?? new Date()
  const subjects = subjectsInScope(snapshot, scope)

  if (subjects.length === 0) {
    return {
      text: '',
      estimatedTokens: 0,
      overBudget: false,
      included: { posts: 0, reports: 0, subjects: 0 },
    }
  }

  if (mode === 'custom') {
    // Required only: no older filler, no edges expansion beyond room (edges are optional).
    // Spec: required = bookmarks + latest report + profile + all posts in day window.
    // Edges are rank 6 "if room" — not part of required set for overBudget.
    const required = collectBlocks(subjects, dayWindowDays, now, false).filter(
      (b) => b.blockKind !== 'edge',
    )
    const requiredText = assembleText(scope, required)
    const requiredTokens = estimateTokens(requiredText)
    const overBudget = requiredTokens > tokenBudget

    if (overBudget) {
      return {
        text: requiredText,
        estimatedTokens: requiredTokens,
        overBudget: true,
        included: countIncluded(required),
      }
    }

    // Under budget: may add edges if room; do not add older posts/reports.
    const selected = [...required]
    const edges = collectBlocks(subjects, dayWindowDays, now, false).filter(
      (b) => b.blockKind === 'edge',
    )
    for (const block of edges) {
      if (tryAdd(selected, block, scope, tokenBudget)) {
        selected.push(block)
      }
    }

    const text = assembleText(scope, selected)
    return {
      text,
      estimatedTokens: estimateTokens(text),
      overBudget: false,
      included: countIncluded(selected),
    }
  }

  // Auto: fill by rank while under budget; never overBudget.
  const candidates = collectBlocks(subjects, dayWindowDays, now, true)
  const selected: PackBlock[] = []
  for (const block of candidates) {
    if (tryAdd(selected, block, scope, tokenBudget)) {
      selected.push(block)
    }
  }

  // If nothing fits with full framing, try empty (header-less) rather than over budget.
  if (selected.length === 0) {
    return {
      text: '',
      estimatedTokens: 0,
      overBudget: false,
      included: { posts: 0, reports: 0, subjects: 0 },
    }
  }

  const text = assembleText(scope, selected)
  return {
    text,
    estimatedTokens: estimateTokens(text),
    overBudget: false,
    included: countIncluded(selected),
  }
}

/** Bucket wall-clock so day-window packs reuse within a short window. */
const NOW_BUCKET_MS = 60_000
const PACK_CACHE_MAX = 12

const packCache = new Map<string, PackResult>()

function scopeCacheKey(scope: ComposeScope): string {
  switch (scope.type) {
    case 'all':
      return 'all'
    case 'me':
      return 'me'
    case 'target':
      return `target:${scope.username.replace(/^@/, '').toLowerCase()}`
  }
}

/** Cheap invalidation key — gather refreshes bump refreshedAt / lengths / edge ids. */
function snapshotCacheKey(snapshot: IntelSnapshot): string {
  return snapshot.subjects
    .map((s) => {
      const firstPost = s.posts[0]
      const lastPost = s.posts[s.posts.length - 1]
      const firstEdge = s.edges[0]
      return [
        s.kind,
        s.id,
        s.username,
        s.refreshedAt ?? '',
        s.posts.length,
        s.bookmarks.length,
        s.likes.length,
        s.edges.length,
        s.reports.length,
        firstPost?.id ?? '',
        lastPost?.id ?? '',
        firstEdge ? `${firstEdge.targetUsername}:${firstEdge.kind}:${firstEdge.lastSeen}` : '',
        s.profile?.id ?? '',
      ].join(':')
    })
    .join('|')
}

function packCacheKey(input: PackInput, now: Date): string {
  const nowBucket = Math.floor(now.getTime() / NOW_BUCKET_MS)
  return [
    snapshotCacheKey(input.snapshot),
    scopeCacheKey(input.scope),
    input.mode,
    input.dayWindowDays ?? 'all',
    input.tokenBudget,
    nowBucket,
  ].join('::')
}

/** Test helper — clears the module pack cache. */
export function clearPackHotWindowCache(): void {
  packCache.clear()
}

/**
 * Same as packHotWindow, with a small LRU so UI remounts / send-path packs
 * reuse identical inputs without re-ranking the corpus.
 */
export function packHotWindowCached(input: PackInput): PackResult {
  const now = input.now ?? new Date()
  const key = packCacheKey(input, now)
  const hit = packCache.get(key)
  if (hit) {
    // Refresh LRU order.
    packCache.delete(key)
    packCache.set(key, hit)
    return hit
  }

  const result = packHotWindow({ ...input, now })
  packCache.set(key, result)
  while (packCache.size > PACK_CACHE_MAX) {
    const oldest = packCache.keys().next().value
    if (oldest === undefined) break
    packCache.delete(oldest)
  }
  return result
}
