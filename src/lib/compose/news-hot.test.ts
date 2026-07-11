import { describe, it, expect } from 'vitest'
import { formatBookmarkedNewsHot, mergeHotWithNewsBookmarks } from './news-hot'
import type { NewsItem } from '../news/types'

const sample = (over: Partial<NewsItem> = {}): NewsItem => ({
  id: 'abc123',
  feedId: 'coindesk',
  category: 'crypto',
  sourceName: 'CoinDesk',
  title: 'VVV stakes climb',
  summary: 'short',
  url: 'https://example.com/story',
  publishedAt: '2026-07-11T12:00:00.000Z',
  ...over,
})

describe('formatBookmarkedNewsHot', () => {
  it('returns empty when no bookmarks', () => {
    expect(formatBookmarkedNewsHot([])).toBe('')
  })

  it('lists id title url as pointers', () => {
    const text = formatBookmarkedNewsHot([sample()])
    expect(text).toMatch(/BOOKMARKED NEWS/)
    expect(text).toMatch(/\[abc123\]/)
    expect(text).toMatch(/VVV stakes climb/)
    expect(text).toMatch(/https:\/\/example\.com\/story/)
    expect(text).toMatch(/news_read/)
  })
})

describe('mergeHotWithNewsBookmarks', () => {
  it('appends news block after intel hot', () => {
    const { text } = mergeHotWithNewsBookmarks('===== LOCAL INTEL =====\nhi', [sample()])
    expect(text).toMatch(/LOCAL INTEL/)
    expect(text).toMatch(/BOOKMARKED NEWS/)
  })
})
