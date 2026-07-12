import type { Post } from './types'

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
