import { describe, it, expect, beforeEach } from 'vitest'
import { useNewsStore } from './news-store'
import { DEFAULT_FEED_IDS } from '../lib/news/feeds'
import type { NewsItem } from '../lib/news/types'

const item: NewsItem = {
  id: 'a', feedId: 'tc-ai', category: 'ai', sourceName: 'TC', title: 'T',
  summary: 's', url: 'https://x/a', publishedAt: '',
}

function reset() {
  useNewsStore.setState({
    enabledFeedIds: DEFAULT_FEED_IDS,
    activeCategory: 'all',
    bookmarks: [],
  })
}

describe('news-store', () => {
  beforeEach(reset)

  it('defaults to the default feed ids', () => {
    expect(useNewsStore.getState().enabledFeedIds).toEqual(DEFAULT_FEED_IDS)
  })

  it('toggleFeed removes then re-adds a feed', () => {
    useNewsStore.getState().toggleFeed('tc-ai')
    expect(useNewsStore.getState().enabledFeedIds).not.toContain('tc-ai')
    useNewsStore.getState().toggleFeed('tc-ai')
    expect(useNewsStore.getState().enabledFeedIds).toContain('tc-ai')
  })

  it('toggleBookmark adds then removes by url', () => {
    useNewsStore.getState().toggleBookmark(item)
    expect(useNewsStore.getState().bookmarks).toHaveLength(1)
    useNewsStore.getState().toggleBookmark(item)
    expect(useNewsStore.getState().bookmarks).toHaveLength(0)
  })

  it('isBookmarked reflects state', () => {
    expect(useNewsStore.getState().isBookmarked('https://x/a')).toBe(false)
    useNewsStore.getState().toggleBookmark(item)
    expect(useNewsStore.getState().isBookmarked('https://x/a')).toBe(true)
  })
})
