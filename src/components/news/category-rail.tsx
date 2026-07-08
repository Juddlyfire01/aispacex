import { useState } from 'react'
import { cn } from '../../lib/utils'
import { NEWS_CATEGORIES, NEWS_FEEDS } from '../../lib/news/feeds'
import { useNewsStore, type NewsCategoryFilter } from '../../stores/news-store'
import { Checkbox } from '../ui/checkbox'

function BookmarkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('transition-transform', open && 'rotate-90')}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function CategoryRail({ counts, bookmarkCount }: {
  counts: Record<string, number>
  bookmarkCount: number
}) {
  const activeCategory = useNewsStore((s) => s.activeCategory)
  const setActiveCategory = useNewsStore((s) => s.setActiveCategory)
  const enabledFeedIds = useNewsStore((s) => s.enabledFeedIds)
  const toggleFeed = useNewsStore((s) => s.toggleFeed)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  const rowCls = (active: boolean) =>
    cn(
      'flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-[13px] transition-colors text-left',
      active
        ? 'bg-white/[0.05] text-[var(--color-text-primary)]'
        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.03]',
    )

  const catRow = (id: NewsCategoryFilter, label: string, count?: number) => (
    <button key={id} type="button" onClick={() => setActiveCategory(id)} className={rowCls(activeCategory === id)}>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {count != null && count > 0 && (
        <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">{count}</span>
      )}
    </button>
  )

  return (
    <div className="flex flex-col gap-1">
      {catRow('all', 'All', counts.all)}
      {NEWS_CATEGORIES.map((c) => catRow(c.id, c.label, counts[c.id]))}

      <button type="button" onClick={() => setActiveCategory('bookmarks')} className={rowCls(activeCategory === 'bookmarks')}>
        <BookmarkIcon />
        <span className="flex-1 min-w-0 truncate">Bookmarks</span>
        {bookmarkCount > 0 && (
          <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">{bookmarkCount}</span>
        )}
      </button>

      <div className="mt-2 pt-2 border-t border-[var(--color-border-faint)]">
        <button
          type="button"
          onClick={() => setSourcesOpen((v) => !v)}
          className="flex items-center gap-1.5 w-full px-2.5 py-1 text-[10.5px] uppercase tracking-[0.1em] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <Chevron open={sourcesOpen} />
          Sources
        </button>
        {sourcesOpen && (
          <div className="mt-1 flex flex-col gap-0.5">
            {NEWS_FEEDS.map((feed) => {
              const on = enabledFeedIds.includes(feed.id)
              return (
                <label
                  key={feed.id}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-md text-[12px] text-[var(--color-text-secondary)] hover:bg-white/[0.03] cursor-pointer"
                >
                  <Checkbox checked={on} onChange={() => toggleFeed(feed.id)} />
                  <span className="flex-1 min-w-0 truncate">{feed.name}</span>
                  <span className="text-[9px] uppercase tracking-[0.05em] text-[var(--color-text-tertiary)]">{feed.category}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
