import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Post, XPostRaw } from './types'

// Mock the X client so discovery/hydrate can be driven deterministically.
const xapiMock = vi.fn()
vi.mock('./x-client', () => ({
  xapi: (...args: unknown[]) => xapiMock(...args),
  XAPIError: class XAPIError extends Error {},
}))
// mergePosts pulls in the zustand store; stub to a pure merge for tests.
vi.mock('../../stores/x-intel-store', () => ({
  mergePosts: (a: Post[], b: Post[]) => {
    const map = new Map<string, Post>()
    for (const p of a) map.set(p.id, p)
    for (const p of b) map.set(p.id, p)
    return [...map.values()]
  },
}))

import { findArticleStubIds, hydrateArticlePosts } from './article-hydrate'

function rawArticle(id: string, over: Partial<XPostRaw> = {}): XPostRaw {
  return {
    id,
    text: 'https://t.co/teaser',
    author_id: '42',
    created_at: '2026-07-01T14:28:03.000Z',
    article: { title: 'Toward Unrestricted Intelligence' },
    ...over,
  }
}

function post(over: Partial<Post> & Pick<Post, 'id'>): Post {
  return {
    authorId: '42',
    text: 'hello',
    lang: 'en',
    createdAt: '2026-07-01T12:00:00Z',
    metrics: { impressions: 0, likes: 0, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
    kind: 'original',
    referenced: [],
    urls: [],
    mentions: [],
    mediaKeys: [],
    contextAnnotations: [],
    gatheredAt: '2026-07-01T12:00:00Z',
    ...over,
  }
}

describe('findArticleStubIds', () => {
  it('flags teaser posts with /i/article/ urls', () => {
    const stub = post({
      id: '2072326370206581037',
      text: 'https://t.co/RSRtnWPPRa',
      urls: [
        {
          expanded: 'http://x.com/i/article/2072269716215705600',
          display: 'x.com/i/article/2072…',
        },
      ],
    })
    const normal = post({ id: '2', text: 'Just a normal post' })
    expect(findArticleStubIds('42', [stub, normal])).toEqual(['2072326370206581037'])
  })

  it('flags bare t.co original teasers without entities', () => {
    const stub = post({
      id: '2072326370206581037',
      text: 'https://t.co/RSRtnWPPRa',
      urls: [],
    })
    expect(findArticleStubIds('42', [stub])).toEqual(['2072326370206581037'])
  })

  it('includes legacy rows with empty authorId', () => {
    const stub = post({
      id: '207',
      authorId: '',
      text: 'https://t.co/abc',
      urls: [],
    })
    expect(findArticleStubIds('42', [stub])).toEqual(['207'])
  })

  it('skips already-hydrated articles', () => {
    const body = 'A'.repeat(500)
    const hydrated = post({
      id: '1',
      format: 'article',
      articleTitle: 'Series A',
      text: `Series A\n\n${body}`,
      urls: [{ expanded: 'http://x.com/i/article/1', display: 'x.com/i/article/1' }],
    })
    expect(findArticleStubIds('42', [hydrated])).toEqual([])
  })

  it('ignores other authors', () => {
    const stub = post({
      id: '1',
      authorId: '99',
      text: 'https://t.co/x',
      urls: [{ expanded: 'http://x.com/i/article/1', display: 'article' }],
    })
    expect(findArticleStubIds('42', [stub])).toEqual([])
  })
})

describe('hydrateArticlePosts (store-only, no timeline scan)', () => {
  beforeEach(() => xapiMock.mockReset())

  it('hydrates a title-only Article stub already in the gathered window', async () => {
    const body = 'Series A body '.repeat(40) // > HYDRATED_MIN_CHARS
    // A stub already in the store: format=article but only the title as text.
    const stub = post({
      id: '2072326370206581037',
      format: 'article',
      articleTitle: 'Series A',
      text: 'Series A',
      urls: [{ expanded: 'http://x.com/i/article/1', display: 'x.com/i/article/1' }],
    })
    // Single GET /tweets?ids=… returns the full body — the ONLY network call.
    xapiMock.mockResolvedValueOnce({
      data: [rawArticle('2072326370206581037', {
        article: { title: 'Series A', plain_text: body },
      })],
    })

    const result = await hydrateArticlePosts('42', [stub], 'oauth')
    expect(xapiMock).toHaveBeenCalledTimes(1) // no scanning — one hydrate call
    expect(result.updated).toBe(true)
    expect(result.hydratedIds).toEqual(['2072326370206581037'])
    const article = result.posts.find((p) => p.id === '2072326370206581037')
    expect(article?.format).toBe('article')
    expect((article?.text.length ?? 0)).toBeGreaterThan(400)
  })

  it('makes NO network call when the window holds no Article stubs', async () => {
    const normal = post({ id: '1', text: 'just a regular post' })
    const result = await hydrateArticlePosts('42', [normal], 'oauth')
    expect(xapiMock).not.toHaveBeenCalled()
    expect(result.updated).toBe(false)
    expect(result.stubIds).toEqual([])
  })

  it('does not re-fetch an already-hydrated Article', async () => {
    const hydrated = post({
      id: '1',
      format: 'article',
      articleTitle: 'Series A',
      text: `Series A\n\n${'A'.repeat(500)}`,
    })
    const result = await hydrateArticlePosts('42', [hydrated], 'oauth')
    expect(xapiMock).not.toHaveBeenCalled()
    expect(result.updated).toBe(false)
  })
})
