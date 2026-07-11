import { useMemo } from 'react'
import { useNews } from '../../hooks/use-news'
import { useNewsStore } from '../../stores/news-store'
import { NEWS_CATEGORIES } from '../../lib/news/feeds'
import type { NewsCategory, NewsItem } from '../../lib/news/types'
import { relTime } from '../../lib/venicestats/format'
import { ViewLoadingFallback } from '../ui/spinner'
import { StatsSection } from '../x-intel/stats/stats-ui'
import { CategoryRail } from './category-rail'
import { LatestStrip } from './latest-strip'
import { NewsFeed } from './news-feed'

export function NewsView() {
  const enabledFeedIds = useNewsStore((s) => s.enabledFeedIds)
  const activeCategory = useNewsStore((s) => s.activeCategory)
  const bookmarks = useNewsStore((s) => s.bookmarks)
  const news = useNews(enabledFeedIds)

  const items = useMemo(() => news.data?.items ?? [], [news.data])
  const failures = news.data?.failures ?? []

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const cat of NEWS_CATEGORIES) c[cat.id] = 0
    for (const it of items) c[it.category] = (c[it.category] ?? 0) + 1
    return c
  }, [items])

  // Items shown in the feed, filtered by the active category / bookmarks view.
  const displayItems: NewsItem[] = useMemo(() => {
    if (activeCategory === 'bookmarks') return bookmarks
    if (activeCategory === 'all') return items
    return items.filter((i) => i.category === (activeCategory as NewsCategory))
  }, [activeCategory, items, bookmarks])

  const updated = news.dataUpdatedAt ? relTime(new Date(news.dataUpdatedAt).toISOString()) : ''

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-6 w-full">
        {enabledFeedIds.length === 0 ? (
          <div className="flex flex-1 items-center justify-center min-h-[40vh] px-6 text-center">
            <p className="text-[13px] text-[var(--color-text-secondary)] max-w-sm">
              No sources enabled. Open the <span className="text-[var(--color-text-primary)]">Sources</span> panel and enable a few feeds to start reading.
            </p>
          </div>
        ) : news.isLoading ? (
          <div className="flex flex-1 items-center justify-center min-h-[40vh]">
            <ViewLoadingFallback label="Loading news…" className="h-auto" />
          </div>
        ) : news.isError ? (
          <div className="flex flex-1 items-center justify-center min-h-[40vh] px-6 text-center">
            <div className="space-y-2 max-w-sm">
              <p className="text-[13px] text-[var(--color-text-primary)]">Could not load the news feed</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                {news.error instanceof Error ? news.error.message : 'News proxy unreachable'}
              </p>
              <button
                type="button"
                onClick={() => news.refetch()}
                className="text-[11px] text-[var(--color-accent)] hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeCategory !== 'bookmarks' && (
              <StatsSection
                title="Latest"
                titleExtra={
                  updated ? (
                    <span className="text-[11px] text-[var(--color-text-secondary)] shrink-0">
                      · Updated {updated}
                    </span>
                  ) : null
                }
              >
                <LatestStrip items={items} />
              </StatsSection>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-start">
              <aside className="md:sticky md:top-0">
                <CategoryRail counts={counts} bookmarkCount={bookmarks.length} />
              </aside>
              <div className="min-w-0">
                {activeCategory === 'bookmarks' && displayItems.length === 0 ? (
                  <div className="flex items-center justify-center h-40 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-bg-raised)] text-[12px] text-[var(--color-text-secondary)]">
                    No bookmarks yet — expand an article and tap the bookmark icon.
                  </div>
                ) : (
                  <NewsFeed items={displayItems} failures={failures} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
