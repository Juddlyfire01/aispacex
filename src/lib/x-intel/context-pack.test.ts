import { describe, it, expect } from 'vitest'
import {
  articleSlotCeiling,
  packPostsForContext,
  formatTranscriptLine,
  ARTICLE_SLOT_RATIO,
} from './context-pack'
import type { Post } from './types'

function post(over: Partial<Post> & Pick<Post, 'id'>): Post {
  return {
    authorId: '1',
    text: 'short post',
    lang: 'en',
    createdAt: '2026-07-01T12:00:00Z',
    metrics: { impressions: 0, likes: 1, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
    kind: 'original',
    format: 'post',
    referenced: [],
    urls: [],
    mentions: [],
    mediaKeys: [],
    contextAnnotations: [],
    gatheredAt: '2026-07-01T12:00:00Z',
    ...over,
  }
}

describe('articleSlotCeiling', () => {
  it('is 1:10 of cap with min 1', () => {
    expect(articleSlotCeiling(80)).toBe(Math.floor(80 / ARTICLE_SLOT_RATIO))
    expect(articleSlotCeiling(10)).toBe(1)
    expect(articleSlotCeiling(9)).toBe(1)
    expect(articleSlotCeiling(0)).toBe(0)
  })
})

describe('packPostsForContext', () => {
  it('always includes a single article even when many newer posts exist', () => {
    const posts: Post[] = []
    for (let i = 0; i < 30; i++) {
      posts.push(
        post({
          id: `p${i}`,
          createdAt: `2026-07-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
          text: `post ${i}`,
        }),
      )
    }
    posts.push(
      post({
        id: 'art1',
        format: 'article',
        articleTitle: 'Series A',
        createdAt: '2026-06-01T12:00:00Z',
        text: 'Article body with enough words to count as long form prose for the register.',
      }),
    )
    const packed = packPostsForContext(posts, 20)
    expect(packed.some((p) => p.id === 'art1')).toBe(true)
    expect(packed.length).toBeLessThanOrEqual(20)
  })

  it('respects 1:10 article ceiling and fills leftover with posts', () => {
    const articles = Array.from({ length: 15 }, (_, i) =>
      post({
        id: `a${i}`,
        format: 'article',
        createdAt: `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        text: `Article ${i} short body.`,
      }),
    )
    const posts = Array.from({ length: 50 }, (_, i) =>
      post({
        id: `p${i}`,
        createdAt: `2026-07-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
        text: `Post ${i}`,
      }),
    )
    const packed = packPostsForContext([...articles, ...posts], 20)
    const articleCount = packed.filter((p) => p.format === 'article').length
    expect(articleCount).toBeLessThanOrEqual(articleSlotCeiling(20))
    expect(packed.length).toBe(20)
    expect(packed.some((p) => p.format !== 'article')).toBe(true)
  })

  it('labels transcript lines with format', () => {
    const line = formatTranscriptLine(
      post({
        id: '207',
        format: 'article',
        articleTitle: 'Toward Unrestricted Intelligence',
        text: 'Body',
      }),
    )
    expect(line).toMatch(/\(article\/original/)
    expect(line).toMatch(/Toward Unrestricted Intelligence/)
  })
})
