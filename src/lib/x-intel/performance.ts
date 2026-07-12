import type { Post, PostKind, Profile } from './types'

export type PerformanceWindow = '7d' | '30d' | 'all'
export type PerformanceRankMode = 'engagement_rate' | 'amplification' | 'likes' | 'composite'

export const PERF_TOP_LIST_CAP = 10
export const PERF_FILL_MIN = 3
export const PERF_RELATIVE_MULT = 1.5
export const PERF_COMPOSITE_WEIGHTS = { rate: 0.5, amp: 0.35, likes: 0.15 } as const

const DAY_MS = 86_400_000

export function filterPostsByWindow(
  posts: Post[],
  window: PerformanceWindow,
  nowMs: number = Date.now(),
): Post[] {
  if (window === 'all') {
    return posts.filter((p) => Number.isFinite(Date.parse(p.createdAt)))
  }
  const days = window === '7d' ? 7 : 30
  const cutoff = nowMs - days * DAY_MS
  return posts.filter((p) => {
    const t = Date.parse(p.createdAt)
    return Number.isFinite(t) && t >= cutoff
  })
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
  // Nearest-rank: rank = ceil(p/100 * n), then 0-index
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  )
  return sortedAsc[idx]
}

export function likesFloor(followers: number): number {
  return Math.max(5, Math.min(50, Math.round(followers * 0.001)))
}

export type CompositeMedians = { rateMed: number; ampMed: number; likesMed: number }

export function rawMetric(p: Post, mode: PerformanceRankMode): number {
  if (mode === 'engagement_rate') return postEngagementRate(p)
  if (mode === 'amplification') return postAmplification(p)
  if (mode === 'likes') return p.metrics.likes
  return 0
}

export function scorePost(
  p: Post,
  mode: PerformanceRankMode,
  medians: CompositeMedians,
): number {
  if (mode === 'engagement_rate') return postEngagementRate(p)
  if (mode === 'amplification') return postAmplification(p)
  if (mode === 'likes') return p.metrics.likes

  const rate = postEngagementRate(p)
  const amp = postAmplification(p)
  const likes = p.metrics.likes
  const terms: { w: number; n: number }[] = []
  if (medians.rateMed > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.rate, n: rate / medians.rateMed })
  } else if (rate > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.rate, n: 1 })
  }
  if (medians.ampMed > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.amp, n: amp / medians.ampMed })
  } else if (amp > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.amp, n: 1 })
  }
  if (medians.likesMed > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.likes, n: likes / medians.likesMed })
  } else if (likes > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.likes, n: 1 })
  }
  if (terms.length === 0) return 0
  const wSum = terms.reduce((a, t) => a + t.w, 0)
  return terms.reduce((a, t) => a + (t.w / wSum) * t.n, 0)
}

export function isRateScorable(p: Post): boolean {
  return p.metrics.impressions > 0
}

export function absoluteFloorOk(
  p: Post,
  mode: PerformanceRankMode,
  followers: number,
  rateMedian: number,
): boolean {
  if (mode === 'likes' || mode === 'composite') {
    return p.metrics.likes >= likesFloor(followers)
  }
  if (mode === 'amplification') {
    return postAmplification(p) >= 2
  }
  return p.metrics.impressions >= 100 && postEngagementRate(p) >= rateMedian
}

export function relativeOk(metric: number, values: number[]): boolean {
  if (values.length === 0) return false
  const sorted = [...values].sort((a, b) => a - b)
  const med = medianOf(sorted)
  const p75 = percentileAsc(sorted, 75)
  const bar = Math.max(med * PERF_RELATIVE_MULT, p75)
  return metric >= bar
}

export const MODE_LABEL: Record<PerformanceRankMode, string> = {
  engagement_rate: 'engagement rate',
  amplification: 'amplification',
  likes: 'likes',
  composite: 'composite score',
}

export function formatWhy(opts: {
  mode: PerformanceRankMode
  multipleOfMedian: number | null
  belowThreshold: boolean
}): string {
  const label = MODE_LABEL[opts.mode]
  if (opts.belowThreshold) {
    return `Near the top of this window on ${label}, but below the top-post threshold.`
  }
  if (opts.multipleOfMedian != null && opts.multipleOfMedian > 0) {
    return `${opts.multipleOfMedian}× this account's median ${label}; clears the absolute floor.`
  }
  return `Clears the top-post bar on ${label} for this window.`
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
  profile: Profile
  window: PerformanceWindow
  mode: PerformanceRankMode
  nowMs?: number
  inbound?: Post[]
}): TopPostsResult {
  const nowMs = opts.nowMs ?? Date.now()
  const candidates = filterPostsByWindow(opts.posts, opts.window, nowMs)
  const mode = opts.mode
  const inbound = opts.inbound ?? []

  const scorable =
    mode === 'engagement_rate' ? candidates.filter(isRateScorable) : candidates

  const rateValues = scorable.map(postEngagementRate)
  const ampValues = scorable.map(postAmplification)
  const likesValues = scorable.map((p) => p.metrics.likes)
  const medians: CompositeMedians = {
    rateMed: medianOf(rateValues),
    ampMed: medianOf(ampValues),
    likesMed: medianOf(likesValues),
  }

  const metricValues =
    mode === 'composite'
      ? scorable.map((p) => scorePost(p, 'composite', medians))
      : mode === 'engagement_rate'
        ? rateValues
        : mode === 'amplification'
          ? ampValues
          : likesValues

  const medianMetric = medianOf(metricValues)
  const rateMedian = medians.rateMed

  const scored: ScoredPost[] = scorable
    .map((post) => {
      const score = scorePost(post, mode, medians)
      const metricForMode =
        mode === 'composite' ? score : rawMetric(post, mode)
      const multipleOfMedian =
        medianMetric > 0 ? Math.round((metricForMode / medianMetric) * 10) / 10 : null
      const eligible =
        relativeOk(metricForMode, metricValues) &&
        absoluteFloorOk(post, mode, opts.profile.metrics.followers, rateMedian)
      const belowThreshold = !eligible
      return {
        post,
        score,
        metricForMode,
        multipleOfMedian,
        belowThreshold,
        why: formatWhy({ mode, multipleOfMedian, belowThreshold }),
        amplifiers: amplifiersForPost(post.id, inbound),
      }
    })
    .sort((a, b) => b.score - a.score || b.post.metrics.likes - a.post.metrics.likes)

  const eligible = scored.filter((s) => !s.belowThreshold)
  const items: ScoredPost[] = [...eligible]
  if (items.length < PERF_FILL_MIN) {
    for (const s of scored) {
      if (items.length >= PERF_FILL_MIN) break
      if (!items.some((i) => i.post.id === s.post.id)) {
        items.push({
          ...s,
          belowThreshold: true,
          why: formatWhy({ mode, multipleOfMedian: s.multipleOfMedian, belowThreshold: true }),
        })
      }
    }
  }
  const capped = items.slice(0, PERF_TOP_LIST_CAP)

  return {
    candidates,
    scored,
    items: capped,
    eligibleCount: eligible.length,
    medianMetric,
    mode,
  }
}

export interface PerformanceGlance {
  engagementRate: number
  topPostCount: number
  leadingKind: PostKind
  vsMedian: number | null
}

export function buildGlance(top: TopPostsResult): PerformanceGlance {
  let likes = 0
  let reposts = 0
  let replies = 0
  let quotes = 0
  let impressions = 0
  for (const p of top.candidates) {
    likes += p.metrics.likes
    reposts += p.metrics.reposts
    replies += p.metrics.replies
    quotes += p.metrics.quotes
    impressions += p.metrics.impressions
  }
  const engagementRate =
    impressions > 0 ? (likes + reposts + replies + quotes) / impressions : 0

  const kindScores = new Map<PostKind, { sum: number; n: number }>()
  for (const k of ['original', 'reply', 'quote', 'retweet'] as PostKind[]) {
    kindScores.set(k, { sum: 0, n: 0 })
  }
  for (const s of top.scored) {
    const slot = kindScores.get(s.post.kind)!
    slot.sum += s.score
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

  const eligibleItems = top.items.filter((i) => !i.belowThreshold)
  let vsMedian: number | null = null
  if (eligibleItems.length > 0 && top.medianMetric > 0) {
    const mults = eligibleItems
      .map((i) => i.multipleOfMedian)
      .filter((m): m is number => m != null)
    vsMedian = mults.length ? medianOf(mults) : null
  }

  return {
    engagementRate,
    topPostCount: top.eligibleCount,
    leadingKind,
    vsMedian,
  }
}

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
  medians: CompositeMedians,
): PerformancePatterns {
  const kinds: PostKind[] = ['original', 'reply', 'quote', 'retweet']
  const byKind: PatternKindRow[] = kinds.map((kind) => {
    const inKind = candidates.filter((p) => p.kind === kind)
    const avgScore =
      inKind.length === 0
        ? 0
        : inKind.reduce((a, p) => a + scorePost(p, mode, medians), 0) / inKind.length
    return { kind, avgScore, count: inKind.length }
  })
  const leading = [...byKind].sort((a, b) => b.avgScore - a.avgScore || b.count - a.count)[0]
  const leadingKind = leading?.kind ?? 'original'
  const examples = candidates
    .filter((p) => p.kind === leadingKind)
    .map((p) => ({ p, s: scorePost(p, mode, medians) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.p)
  const kindLabel =
    leadingKind === 'original'
      ? 'Originals'
      : leadingKind === 'reply'
        ? 'Replies'
        : leadingKind === 'quote'
          ? 'Quotes'
          : 'Reposts'
  const caption = `${kindLabel} lead on ${MODE_LABEL[mode]} in this window.`
  return { byKind, leadingKind, examples, caption }
}
