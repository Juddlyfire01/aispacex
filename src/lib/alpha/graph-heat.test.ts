import { describe, expect, it } from 'vitest'
import { rankGraphHeat } from './graph-heat'
import type { Post } from '../x-intel/types'

function post(partial: Partial<Post> & { id: string; text: string }): Post {
  return {
    authorId: '1',
    createdAt: new Date().toISOString(),
    kind: 'original',
    metrics: { impressions: 1000, likes: 10, reposts: 1, replies: 0, quotes: 0, bookmarks: 0 },
    lang: 'en',
    entities: {},
    referenced: [],
    ...partial,
  } as Post
}

describe('rankGraphHeat', () => {
  it('ranks higher engagement first when recency similar', () => {
    const now = Date.now()
    const items = rankGraphHeat(
      [
        post({
          id: '1',
          text: 'low',
          createdAt: new Date(now).toISOString(),
          metrics: { impressions: 0, likes: 1, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
        }),
        post({
          id: '2',
          text: 'high',
          createdAt: new Date(now).toISOString(),
          metrics: { impressions: 0, likes: 100, reposts: 10, replies: 5, quotes: 2, bookmarks: 0 },
        }),
      ],
      10,
      now,
    )
    expect(items[0]?.id).toBe('2')
  })

  it('respects limit', () => {
    const posts = Array.from({ length: 20 }, (_, i) =>
      post({ id: String(i), text: `p${i}` }),
    )
    expect(rankGraphHeat(posts, 5)).toHaveLength(5)
  })
})
