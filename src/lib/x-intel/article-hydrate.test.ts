import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Post, XPostRaw, XPaginatedResponse } from './types'

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

import { findArticleStubIds, discoverArticleStubIds, hydrateArticlePosts } from './article-hydrate'

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

function page(rows: XPostRaw[], nextToken?: string): XPaginatedResponse<XPostRaw> {
  return { data: rows, meta: { result_count: rows.length, next_token: nextToken } }
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

describe('discoverArticleStubIds', () => {
  beforeEach(() => xapiMock.mockReset())

  it('finds Article posts on the timeline even when they carry only a title', async () => {
    // Timeline returns the Article post as { article: { title } } — no body/url.
    xapiMock.mockResolvedValueOnce(page([
      rawArticle('2072326370206581037'),
      { id: '2', text: 'a normal post', author_id: '42', created_at: '2026-07-10T00:00:00Z' },
    ]))
    const { ids } = await discoverArticleStubIds('42', 'oauth', new Set())
    expect(ids).toEqual(['2072326370206581037'])
  })

  it('paginates until it runs out of pages or hits the cap', async () => {
    xapiMock
      .mockResolvedValueOnce(page([{ id: 'a', text: 'x', author_id: '42' }], 'tok1'))
      .mockResolvedValueOnce(page([rawArticle('b')], 'tok2'))
      .mockResolvedValueOnce(page([{ id: 'c', text: 'y', author_id: '42' }])) // no next_token → stop
    const { ids } = await discoverArticleStubIds('42', 'oauth', new Set())
    expect(ids).toEqual(['b'])
    expect(xapiMock).toHaveBeenCalledTimes(3)
  })

  it('skips ids already known to the store', async () => {
    xapiMock.mockResolvedValueOnce(page([rawArticle('known'), rawArticle('fresh')]))
    const { ids } = await discoverArticleStubIds('42', 'oauth', new Set(['known']))
    expect(ids).toEqual(['fresh'])
  })

  it('is resilient to a page fetch failure', async () => {
    xapiMock.mockRejectedValueOnce(new Error('rate limit'))
    const { ids, cost } = await discoverArticleStubIds('42', 'oauth', new Set())
    expect(ids).toEqual([])
    expect(cost).toBe(0)
  })
})

describe('hydrateArticlePosts discovery integration', () => {
  beforeEach(() => xapiMock.mockReset())

  it('discovers an out-of-window Article and hydrates its full body', async () => {
    const body = 'Series A body '.repeat(40) // > HYDRATED_MIN_CHARS
    xapiMock
      // 1) discovery timeline page finds the title-only Article
      .mockResolvedValueOnce(page([rawArticle('2072326370206581037')]))
      // 2) GET /tweets?ids=… returns the full article payload
      .mockResolvedValueOnce({
        data: [rawArticle('2072326370206581037', {
          article: { title: 'Series A', plain_text: body },
        })],
      })

    const result = await hydrateArticlePosts('42', [], 'oauth')
    expect(result.updated).toBe(true)
    expect(result.hydratedIds).toEqual(['2072326370206581037'])
    const article = result.posts.find((p) => p.id === '2072326370206581037')
    expect(article?.format).toBe('article')
    expect((article?.text.length ?? 0)).toBeGreaterThan(400)
  })

  it('skips discovery when the store already holds a hydrated Article', async () => {
    const hydrated = post({
      id: '1',
      format: 'article',
      articleTitle: 'Series A',
      text: `Series A\n\n${'A'.repeat(500)}`,
    })
    const result = await hydrateArticlePosts('42', [hydrated], 'oauth')
    expect(result.updated).toBe(false)
    expect(xapiMock).not.toHaveBeenCalled()
  })
})
