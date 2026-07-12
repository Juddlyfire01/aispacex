import type { Post, Profile } from './types'

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
      return {
        post,
        score,
        metricForMode,
        multipleOfMedian,
        belowThreshold: !eligible,
        why: '',
        amplifiers: [] as string[],
      }
    })
    .sort((a, b) => b.score - a.score || b.post.metrics.likes - a.post.metrics.likes)

  const eligible = scored.filter((s) => !s.belowThreshold)
  const items: ScoredPost[] = [...eligible]
  if (items.length < PERF_FILL_MIN) {
    for (const s of scored) {
      if (items.length >= PERF_FILL_MIN) break
      if (!items.some((i) => i.post.id === s.post.id)) {
        items.push({ ...s, belowThreshold: true })
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
