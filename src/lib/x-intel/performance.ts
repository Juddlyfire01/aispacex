import type { Post, PostKind, Profile } from './types'
import { isPureRetweet } from './post-kind'

export type PerformanceWindow = '7d' | '30d' | 'all'

/** Rank modes: raw metrics + X-style weighted composite. */
export type PerformanceRankMode =
  | 'composite'
  | 'impressions'
  | 'likes'
  | 'reposts'
  | 'replies'
  | 'quotes'
  | 'bookmarks'

export const PERF_TOP_LIST_CAP = 10
export const PERF_CATALYST_CAP = 5
export const PERF_SNAPSHOT_MAX = 180
export const PERF_SNAPSHOT_MIN_GAP_MS = 6 * 60 * 60 * 1000 // 6h — avoid spam on rapid refreshes

/**
 * X-style engagement weights from the 2023 open-source heavy ranker table,
 * adapted to public counts we actually store.
 * - likes (favorite) 0.5
 * - reposts (retweet) 1.0
 * - replies 13.5
 * - quotes: high-effort (aligned with strong actions; not a named 2023 row)
 * - bookmarks: save intent (adapted)
 * Impressions are intentionally excluded so empty reach does not dominate.
 */
export const X_ENGAGEMENT_WEIGHTS = {
  likes: 0.5,
  reposts: 1.0,
  replies: 13.5,
  quotes: 12.0,
  bookmarks: 10.0,
} as const

const DAY_MS = 86_400_000

/**
 * Pure retweets are excluded from Performance engagement (totals, top posts,
 * series, catalysts, snapshots). Uses {@link isPureRetweet} so mis-normalized
 * shells (`kind: original` + `referenced: reposted`) cannot rank either.
 * X copies the original's public_metrics (especially retweet_count) onto the RT shell,
 * so summing them credits viral others as this account's earned reposts.
 * Originals, replies, and quotes still count.
 */
export function isEarnedEngagementPost(p: Post): boolean {
  return !isPureRetweet(p)
}

export function earnedEngagementPosts(posts: Post[]): Post[] {
  return posts.filter(isEarnedEngagementPost)
}

export function filterPostsByWindow(
  posts: Post[],
  window: PerformanceWindow,
  nowMs: number = Date.now(),
): Post[] {
  const earned = earnedEngagementPosts(posts)
  if (window === 'all') {
    return earned.filter((p) => Number.isFinite(Date.parse(p.createdAt)))
  }
  const days = window === '7d' ? 7 : 30
  const cutoff = nowMs - days * DAY_MS
  return earned.filter((p) => {
    const t = Date.parse(p.createdAt)
    return Number.isFinite(t) && t >= cutoff
  })
}

/** X-style weighted engagement score for one post (public counts only). */
export function xWeightedScore(p: Post): number {
  const m = p.metrics
  return (
    X_ENGAGEMENT_WEIGHTS.likes * m.likes +
    X_ENGAGEMENT_WEIGHTS.reposts * m.reposts +
    X_ENGAGEMENT_WEIGHTS.replies * m.replies +
    X_ENGAGEMENT_WEIGHTS.quotes * m.quotes +
    X_ENGAGEMENT_WEIGHTS.bookmarks * m.bookmarks
  )
}

export function postEngagementRate(p: Post): number {
  const impr = p.metrics.impressions
  if (impr <= 0) return 0
  const n =
    p.metrics.likes + p.metrics.reposts + p.metrics.replies + p.metrics.quotes
  return n / impr
}

export function postAmplification(p: Post): number {
  return p.metrics.reposts + p.metrics.quotes
}

export function medianOf(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export function percentileAsc(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  )
  return sortedAsc[idx]
}

export function metricForMode(p: Post, mode: PerformanceRankMode): number {
  if (mode === 'composite') return xWeightedScore(p)
  if (mode === 'impressions') return p.metrics.impressions
  if (mode === 'likes') return p.metrics.likes
  if (mode === 'reposts') return p.metrics.reposts
  if (mode === 'replies') return p.metrics.replies
  if (mode === 'quotes') return p.metrics.quotes
  return p.metrics.bookmarks
}

/** @deprecated use metricForMode — kept for any residual imports */
export function rawMetric(p: Post, mode: PerformanceRankMode): number {
  return metricForMode(p, mode)
}

/** @deprecated use xWeightedScore */
export function scorePost(p: Post, mode: PerformanceRankMode): number {
  return metricForMode(p, mode)
}

export const MODE_LABEL: Record<PerformanceRankMode, string> = {
  composite: 'X-style score',
  impressions: 'impressions',
  likes: 'likes',
  reposts: 'reposts',
  replies: 'replies',
  quotes: 'quotes',
  bookmarks: 'bookmarks',
}

export function formatWhy(opts: {
  mode: PerformanceRankMode
  multipleOfMedian: number | null
}): string {
  const label = MODE_LABEL[opts.mode]
  if (opts.mode === 'composite') {
    if (opts.multipleOfMedian != null && opts.multipleOfMedian > 0) {
      return `${opts.multipleOfMedian}× this account's median X-style score (likes cheap, replies/conversation heavy).`
    }
    return 'Ranked by X-style weights (2023 public table) on this account\'s posts.'
  }
  if (opts.multipleOfMedian != null && opts.multipleOfMedian > 0) {
    return `${opts.multipleOfMedian}× this account's median ${label} in this window.`
  }
  return `Top of this account's ${label} in this window.`
}

const AMP_REF_TYPES = new Set(['quoted', 'retweeted', 'reposted'])

export function amplifiersForPost(postId: string, inbound: Post[], limit = 3): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of inbound) {
    const hits = p.referenced.some((r) => r.id === postId && AMP_REF_TYPES.has(r.type))
    const handle = (p.authorUsername || '').replace(/^@/, '')
    if (!hits || !handle) continue
    const key = handle.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(handle)
    if (out.length >= limit) break
  }
  return out
}

export interface ScoredPost {
  post: Post
  score: number
  metricForMode: number
  multipleOfMedian: number | null
  /** Always false in v2 ranking — kept so UI/types stay stable. */
  belowThreshold: boolean
  why: string
  amplifiers: string[]
}

export interface TopPostsResult {
  candidates: Post[]
  scored: ScoredPost[]
  items: ScoredPost[]
  eligibleCount: number
  medianMetric: number
  mode: PerformanceRankMode
}

export function buildTopPosts(opts: {
  posts: Post[]
  profile?: Profile
  window: PerformanceWindow
  mode: PerformanceRankMode
  nowMs?: number
  inbound?: Post[]
}): TopPostsResult {
  const nowMs = opts.nowMs ?? Date.now()
  const candidates = filterPostsByWindow(opts.posts, opts.window, nowMs)
  const mode = opts.mode
  const inbound = opts.inbound ?? []

  const metricValues = candidates.map((p) => metricForMode(p, mode))
  const medianMetric = medianOf(metricValues)

  const scored: ScoredPost[] = candidates
    .map((post) => {
      const score = metricForMode(post, mode)
      const multipleOfMedian =
        medianMetric > 0 ? Math.round((score / medianMetric) * 10) / 10 : null
      return {
        post,
        score,
        metricForMode: score,
        multipleOfMedian,
        belowThreshold: false,
        why: formatWhy({ mode, multipleOfMedian }),
        amplifiers: amplifiersForPost(post.id, inbound),
      }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.post.metrics.likes - a.post.metrics.likes ||
        b.post.createdAt.localeCompare(a.post.createdAt),
    )

  const items = scored.slice(0, PERF_TOP_LIST_CAP)

  return {
    candidates,
    scored,
    items,
    eligibleCount: items.length,
    medianMetric,
    mode,
  }
}

// ——— Period totals, deltas, series, catalysts ———

export interface MetricTotals {
  impressions: number
  likes: number
  reposts: number
  replies: number
  quotes: number
  bookmarks: number
  xScore: number
  postCount: number
}

export function emptyTotals(): MetricTotals {
  return {
    impressions: 0,
    likes: 0,
    reposts: 0,
    replies: 0,
    quotes: 0,
    bookmarks: 0,
    xScore: 0,
    postCount: 0,
  }
}

export function sumPostMetrics(posts: Post[]): MetricTotals {
  const t = emptyTotals()
  for (const p of earnedEngagementPosts(posts)) {
    t.impressions += p.metrics.impressions
    t.likes += p.metrics.likes
    t.reposts += p.metrics.reposts
    t.replies += p.metrics.replies
    t.quotes += p.metrics.quotes
    t.bookmarks += p.metrics.bookmarks
    t.xScore += xWeightedScore(p)
    t.postCount += 1
  }
  return t
}

/** Posts with createdAt in [startMs, endMs). Excludes pure retweets. */
export function postsInRange(posts: Post[], startMs: number, endMs: number): Post[] {
  return earnedEngagementPosts(posts).filter((p) => {
    const t = Date.parse(p.createdAt)
    return Number.isFinite(t) && t >= startMs && t < endMs
  })
}

export interface PeriodCompare {
  periodDays: number
  current: MetricTotals
  previous: MetricTotals
  /** current − previous for each field */
  delta: MetricTotals
}

export function comparePeriods(
  posts: Post[],
  periodDays: number,
  nowMs: number = Date.now(),
): PeriodCompare {
  const curStart = nowMs - periodDays * DAY_MS
  const prevStart = nowMs - 2 * periodDays * DAY_MS
  const current = sumPostMetrics(postsInRange(posts, curStart, nowMs + 1))
  const previous = sumPostMetrics(postsInRange(posts, prevStart, curStart))
  const delta = emptyTotals()
  for (const k of Object.keys(delta) as (keyof MetricTotals)[]) {
    delta[k] = current[k] - previous[k]
  }
  return { periodDays, current, previous, delta }
}

export function periodDaysForWindow(window: PerformanceWindow): number {
  if (window === '7d') return 7
  if (window === '30d') return 30
  return 30 // All still uses 30d period compare for deltas
}

export interface SeriesPoint {
  t: number
  v: number
}

/** Daily sum of the active metric for posts created that day (UTC). */
export function buildDailySeries(
  posts: Post[],
  window: PerformanceWindow,
  mode: PerformanceRankMode,
  nowMs: number = Date.now(),
): SeriesPoint[] {
  const candidates = filterPostsByWindow(posts, window, nowMs)
  const byDay = new Map<number, number>()
  for (const p of candidates) {
    const t = Date.parse(p.createdAt)
    if (!Number.isFinite(t)) continue
    const day = Date.UTC(
      new Date(t).getUTCFullYear(),
      new Date(t).getUTCMonth(),
      new Date(t).getUTCDate(),
    )
    byDay.set(day, (byDay.get(day) ?? 0) + metricForMode(p, mode))
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ t, v }))
}

export function catalystPosts(
  posts: Post[],
  startMs: number,
  endMs: number,
  limit = PERF_CATALYST_CAP,
): Post[] {
  return postsInRange(posts, startMs, endMs)
    .map((p) => ({ p, s: xWeightedScore(p) }))
    .sort((a, b) => b.s - a.s || b.p.metrics.likes - a.p.metrics.likes)
    .slice(0, limit)
    .map((x) => x.p)
}

export interface PerformanceGlance {
  current: MetricTotals
  previous: MetricTotals
  delta: MetricTotals
  periodDays: number
  leadingKind: PostKind
  followers: number | null
  followersDelta: number | null
}

export function leadingKindByScore(posts: Post[]): PostKind {
  const kindScores = new Map<PostKind, { sum: number; n: number }>()
  // Retweets excluded from Performance — only kinds that earn engagement for this account.
  for (const k of ['original', 'reply', 'quote'] as PostKind[]) {
    kindScores.set(k, { sum: 0, n: 0 })
  }
  for (const p of earnedEngagementPosts(posts)) {
    const slot = kindScores.get(p.kind)
    if (!slot) continue
    slot.sum += xWeightedScore(p)
    slot.n += 1
  }
  let leadingKind: PostKind = 'original'
  let best = -1
  for (const [k, v] of kindScores) {
    if (v.n === 0) continue
    const avg = v.sum / v.n
    if (avg > best) {
      best = avg
      leadingKind = k
    }
  }
  return leadingKind
}

export function buildGlance(opts: {
  posts: Post[]
  window: PerformanceWindow
  nowMs?: number
  followers?: number | null
  followersDelta?: number | null
}): PerformanceGlance {
  const nowMs = opts.nowMs ?? Date.now()
  const periodDays = periodDaysForWindow(opts.window)
  const cmp = comparePeriods(opts.posts, periodDays, nowMs)
  const windowPosts = filterPostsByWindow(opts.posts, opts.window, nowMs)
  return {
    current: cmp.current,
    previous: cmp.previous,
    delta: cmp.delta,
    periodDays,
    leadingKind: leadingKindByScore(windowPosts),
    followers: opts.followers ?? null,
    followersDelta: opts.followersDelta ?? null,
  }
}

export interface CatalystResult {
  metric: keyof MetricTotals | 'followers'
  delta: number
  periodDays: number
  posts: Post[]
  caption: string
}

/** Pick the strongest positive delta and surface posts from the current period. */
export function buildCatalysts(opts: {
  posts: Post[]
  window: PerformanceWindow
  nowMs?: number
  followersDelta?: number | null
}): CatalystResult | null {
  const nowMs = opts.nowMs ?? Date.now()
  const periodDays = periodDaysForWindow(opts.window)
  const cmp = comparePeriods(opts.posts, periodDays, nowMs)
  const candidates: { key: keyof MetricTotals | 'followers'; delta: number; label: string }[] = [
    { key: 'xScore', delta: cmp.delta.xScore, label: 'X-style score' },
    { key: 'impressions', delta: cmp.delta.impressions, label: 'impressions' },
    { key: 'likes', delta: cmp.delta.likes, label: 'likes' },
    { key: 'replies', delta: cmp.delta.replies, label: 'replies' },
    { key: 'reposts', delta: cmp.delta.reposts, label: 'reposts' },
    { key: 'quotes', delta: cmp.delta.quotes, label: 'quotes' },
    { key: 'bookmarks', delta: cmp.delta.bookmarks, label: 'bookmarks' },
  ]
  if (opts.followersDelta != null && opts.followersDelta > 0) {
    candidates.push({
      key: 'followers',
      delta: opts.followersDelta,
      label: 'followers',
    })
  }
  const best = candidates
    .filter((c) => c.delta > 0)
    .sort((a, b) => b.delta - a.delta)[0]
  if (!best) return null

  const curStart = nowMs - periodDays * DAY_MS
  const posts = catalystPosts(opts.posts, curStart, nowMs + 1)
  if (posts.length === 0) return null

  const caption = `${best.label} up vs prior ${periodDays}d — posts that stood out in this window (correlation, not proof of cause).`
  return {
    metric: best.key,
    delta: best.delta,
    periodDays,
    posts,
    caption,
  }
}

// ——— Snapshot history (followers + engagement totals at gather) ———

export interface MetricSnapshot {
  at: string
  followers: number
  impressions: number
  likes: number
  reposts: number
  replies: number
  quotes: number
  bookmarks: number
  xScore: number
  postCount: number
}

export function makeSnapshot(opts: {
  at?: string
  followers: number
  posts: Post[]
}): MetricSnapshot {
  const totals = sumPostMetrics(opts.posts)
  return {
    at: opts.at ?? new Date().toISOString(),
    followers: opts.followers,
    impressions: totals.impressions,
    likes: totals.likes,
    reposts: totals.reposts,
    replies: totals.replies,
    quotes: totals.quotes,
    bookmarks: totals.bookmarks,
    xScore: totals.xScore,
    postCount: totals.postCount,
  }
}

/** Append snapshot if enough time passed since last sample; cap history length. */
export function appendSnapshot(
  history: MetricSnapshot[] | undefined,
  next: MetricSnapshot,
  minGapMs = PERF_SNAPSHOT_MIN_GAP_MS,
  max = PERF_SNAPSHOT_MAX,
): MetricSnapshot[] {
  const prev = history ?? []
  if (prev.length > 0) {
    const last = prev[prev.length - 1]
    const lastT = Date.parse(last.at)
    const nextT = Date.parse(next.at)
    if (Number.isFinite(lastT) && Number.isFinite(nextT) && nextT - lastT < minGapMs) {
      // Replace last sample if same day-ish refresh
      return [...prev.slice(0, -1), next].slice(-max)
    }
  }
  return [...prev, next].slice(-max)
}

/** Follower delta over approximately `days` looking at snapshot history. */
export function followersDeltaFromHistory(
  history: MetricSnapshot[] | undefined,
  days: number,
  nowMs: number = Date.now(),
): number | null {
  if (!history || history.length < 2) return null
  const cutoff = nowMs - days * DAY_MS
  const sorted = [...history].sort((a, b) => a.at.localeCompare(b.at))
  const latest = sorted[sorted.length - 1]
  // Find sample closest to (now - days)
  let older = sorted[0]
  let bestDist = Infinity
  for (const s of sorted) {
    const t = Date.parse(s.at)
    if (!Number.isFinite(t)) continue
    const dist = Math.abs(t - cutoff)
    if (dist < bestDist) {
      bestDist = dist
      older = s
    }
  }
  if (older.at === latest.at) return null
  return latest.followers - older.followers
}

// ——— Patterns (kept for optional UI) ———

export interface PatternKindRow {
  kind: PostKind
  avgScore: number
  count: number
}

export interface PerformancePatterns {
  byKind: PatternKindRow[]
  leadingKind: PostKind
  examples: Post[]
  caption: string
}

export function buildPatterns(
  candidates: Post[],
  mode: PerformanceRankMode,
): PerformancePatterns {
  const earned = earnedEngagementPosts(candidates)
  const kinds: PostKind[] = ['original', 'reply', 'quote']
  const byKind: PatternKindRow[] = kinds.map((kind) => {
    const inKind = earned.filter((p) => p.kind === kind)
    const avgScore =
      inKind.length === 0
        ? 0
        : inKind.reduce((a, p) => a + metricForMode(p, mode), 0) / inKind.length
    return { kind, avgScore, count: inKind.length }
  })
  const leading = [...byKind].sort((a, b) => b.avgScore - a.avgScore || b.count - a.count)[0]
  const leadingKind = leading?.kind ?? 'original'
  const examples = earned
    .filter((p) => p.kind === leadingKind)
    .map((p) => ({ p, s: metricForMode(p, mode) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.p)
  const kindLabel =
    leadingKind === 'original'
      ? 'Originals'
      : leadingKind === 'reply'
        ? 'Replies'
        : 'Quotes'
  const caption = `${kindLabel} lead on ${MODE_LABEL[mode]} in this window.`
  return { byKind, leadingKind, examples, caption }
}
