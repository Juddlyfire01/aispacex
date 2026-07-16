import type { Post } from '../x-intel/types'

export interface GraphHeatItem {
  id: string
  text: string
  authorUsername?: string
  createdAt?: string
  score: number
  url: string
  source: 'self' | 'target'
}

function engagement(p: Post): number {
  const m = p.metrics
  if (!m) return 0
  return (
    (m.likes ?? 0) +
    (m.replies ?? 0) * 2 +
    (m.reposts ?? 0) * 1.5 +
    (m.quotes ?? 0) * 2 +
    (m.impressions ?? 0) * 0.001
  )
}

/**
 * Rank already-gathered posts by recency × engagement (Band 0 — no new X spend).
 */
export function rankGraphHeat(
  posts: Array<Post & { _source?: 'self' | 'target' }>,
  limit = 12,
  now = Date.now(),
): GraphHeatItem[] {
  const scored = posts
    .filter((p) => p.id && p.text)
    .map((p) => {
      const created = p.createdAt ? Date.parse(p.createdAt) : now
      const ageHours = Math.max(0, (now - created) / 3_600_000)
      const recency = Math.exp(-ageHours / 48)
      const score = engagement(p) * recency + recency * 10
      return {
        id: p.id,
        text: p.text,
        authorUsername: p.authorUsername,
        createdAt: p.createdAt,
        score,
        url: `https://x.com/i/status/${p.id}`,
        source: p._source ?? 'target',
      } satisfies GraphHeatItem
    })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
