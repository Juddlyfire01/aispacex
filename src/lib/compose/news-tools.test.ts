import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getComposeNewsTools,
  executeNewsTool,
  COMPOSE_NEWS_READ_TOOL,
} from './news-tools'
import type { NewsItem } from '../news/types'

const bookmark: NewsItem = {
  id: 'bm1',
  feedId: 'hn',
  category: 'tech',
  sourceName: 'HN',
  title: 'Hello',
  summary: 'sum',
  url: 'https://example.com/a',
  publishedAt: '2026-07-01T00:00:00.000Z',
}

describe('getComposeNewsTools', () => {
  it('always includes news_read; x_news only when on', () => {
    expect(getComposeNewsTools({ xNewsOn: false }).map((t) => t.function.name)).toEqual([
      'news_read',
    ])
    expect(getComposeNewsTools({ xNewsOn: true }).map((t) => t.function.name)).toEqual([
      'news_read',
      'x_news_search',
      'x_news_get',
    ])
    expect(COMPOSE_NEWS_READ_TOOL.function.parameters.additionalProperties).toBe(false)
  })
})

describe('executeNewsTool', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('requires bookmark for news_read', async () => {
    const result = await executeNewsTool(
      'news_read',
      { url: 'https://evil.example/x' },
      { bookmarks: [bookmark], xNewsOn: true, xNewsMaxAgeHours: 24 },
    )
    expect(result).toEqual({ error: expect.stringMatching(/bookmark/i) })
  })

  it('reads bookmarked article via extract API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            url: bookmark.url,
            title: 'Hello full',
            text: 'Full article body here.',
            excerpt: '',
            byline: '',
            siteName: '',
            length: 22,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const result = await executeNewsTool(
      'news_read',
      { id: 'bm1' },
      { bookmarks: [bookmark], xNewsOn: true, xNewsMaxAgeHours: 24 },
    )
    expect(result).toMatchObject({
      id: 'bm1',
      text: 'Full article body here.',
      title: 'Hello full',
    })
  })

  it('blocks x_news when disabled', async () => {
    const result = await executeNewsTool(
      'x_news_search',
      { query: 'VVV' },
      { bookmarks: [], xNewsOn: false, xNewsMaxAgeHours: 24 },
    )
    expect(result).toEqual({ error: expect.stringMatching(/disabled/i) })
  })

  it('x_news_search requests valid news.fields (updated_at, not last_updated_at_ms)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toMatch(/news\/search/)
      expect(url).toMatch(/news\.fields=/)
      expect(url).toMatch(/updated_at/)
      expect(url).not.toMatch(/last_updated_at_ms/)
      expect(url).toMatch(/max_age_hours=48/)
      return new Response(JSON.stringify({ data: [], meta: { result_count: 0 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await executeNewsTool(
      'x_news_search',
      { query: 'VVV', max_results: 5 },
      { bookmarks: [], xNewsOn: true, xNewsMaxAgeHours: 48 },
    )
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result).toEqual({ data: [], meta: { result_count: 0 } })
  })

  it('surfaces X API invalid-field errors from search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: 'One or more parameters to your request was invalid.',
            title: 'Invalid Request',
            error: 'Invalid Request',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const result = await executeNewsTool(
      'x_news_search',
      { query: 'VVV' },
      { bookmarks: [], xNewsOn: true, xNewsMaxAgeHours: 24 },
    )
    expect(result).toMatchObject({ status: 400 })
    expect((result as { error: string }).error).toBeTruthy()
  })
})
