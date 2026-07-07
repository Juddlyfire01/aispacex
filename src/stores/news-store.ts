import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../lib/safe-storage'
import { DEFAULT_FEED_IDS } from '../lib/news/feeds'
import type { NewsCategory, NewsItem } from '../lib/news/types'

export type NewsCategoryFilter = 'all' | NewsCategory | 'bookmarks'

interface NewsState {
  enabledFeedIds: string[]
  activeCategory: NewsCategoryFilter
  bookmarks: NewsItem[]
  setActiveCategory: (c: NewsCategoryFilter) => void
  toggleFeed: (id: string) => void
  setFeedEnabled: (id: string, enabled: boolean) => void
  toggleBookmark: (item: NewsItem) => void
  isBookmarked: (url: string) => boolean
}

export const useNewsStore = create<NewsState>()(
  persist(
    (set, get) => ({
      enabledFeedIds: DEFAULT_FEED_IDS,
      activeCategory: 'all',
      bookmarks: [],
      setActiveCategory: (c) => set({ activeCategory: c }),
      toggleFeed: (id) =>
        set((s) => ({
          enabledFeedIds: s.enabledFeedIds.includes(id)
            ? s.enabledFeedIds.filter((f) => f !== id)
            : [...s.enabledFeedIds, id],
        })),
      setFeedEnabled: (id, enabled) =>
        set((s) => ({
          enabledFeedIds: enabled
            ? Array.from(new Set([...s.enabledFeedIds, id]))
            : s.enabledFeedIds.filter((f) => f !== id),
        })),
      toggleBookmark: (item) =>
        set((s) => ({
          bookmarks: s.bookmarks.some((b) => b.url === item.url)
            ? s.bookmarks.filter((b) => b.url !== item.url)
            : [item, ...s.bookmarks],
        })),
      isBookmarked: (url) => get().bookmarks.some((b) => b.url === url),
    }),
    {
      name: 'venice-news',
      version: 1,
      storage: createJSONStorage(() => createSafeStorage()),
      partialize: (s) => ({
        enabledFeedIds: s.enabledFeedIds,
        activeCategory: s.activeCategory,
        bookmarks: s.bookmarks,
      }),
    },
  ),
)
