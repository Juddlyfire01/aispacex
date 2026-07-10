import { describe, it, expect } from 'vitest'
import { enrichRegisterFewShots } from './register-few-shots'
import type { Post } from './types'

function post(id: string, text: string, likes = 1): Post {
  return {
    id,
    authorId: 'u1',
    text,
    lang: 'en',
    createdAt: '2026-07-10T00:00:00Z',
    kind: 'original',
    metrics: { likes, reposts: 0, replies: 0, quotes: 0, bookmarks: 0, impressions: 0 },
    referenced: [],
    urls: [],
    mentions: [],
    mediaKeys: [],
    contextAnnotations: [],
    gatheredAt: '2026-07-10T00:00:00Z',
  }
}

describe('enrichRegisterFewShots', () => {
  it('fills text from posts for model few-shots with only postId', () => {
    const out = enrichRegisterFewShots({
      fewShotExamples: [{ label: 'tension', postId: '1', text: '' }],
      notablePosts: [],
      ownPosts: [post('1', 'but here is the tension: whale short')],
    })
    expect(out).toHaveLength(1)
    expect(out[0].text).toMatch(/tension/)
    expect(out[0].label).toBe('tension')
  })

  it('backfills from notablePosts then dense posts', () => {
    const out = enrichRegisterFewShots({
      fewShotExamples: [],
      notablePosts: [{ postId: 'a', why: 'Highest density $HYPE dump' }],
      ownPosts: [
        post('a', 'revenue $10.8M weekly'),
        post('b', 'short affirmation ser', 50),
        post('c', 'x'.repeat(200), 10),
      ],
    })
    expect(out[0].postId).toBe('a')
    expect(out[0].label).toMatch(/HYPE|density/i)
    expect(out.length).toBeGreaterThanOrEqual(2)
  })

  it('dedupes by postId', () => {
    const out = enrichRegisterFewShots({
      fewShotExamples: [{ label: 'x', postId: '1', text: 'hello' }],
      notablePosts: [{ postId: '1', why: 'same' }],
      ownPosts: [post('1', 'hello')],
    })
    expect(out).toHaveLength(1)
  })
})
