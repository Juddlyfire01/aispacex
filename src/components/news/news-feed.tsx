import { useMemo, useState } from 'react'
import type { NewsItem, NewsFeedFailure } from '../../lib/news/types'
import { getFeed } from '../../lib/news/feeds'
import { NewsRow } from './news-row'

export function NewsFeed({ items, failures }: {
  items: NewsItem[]
  failures: NewsFeedFailure[]
}) {
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dismissedNotice, setDismissedNotice] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        i.sourceName.toLowerCase().includes(q),
    )
  }, [items, search])

  const failedNames = failures
    .map((f) => getFeed(f.feedId)?.name ?? f.feedId)
    .filter(Boolean)

  return (
    <div className="space-y-2.5">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search headlines…"
        aria-label="Search headlines"
        className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-soft)] rounded-lg px-3 py-1.5 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-placeholder)]"
      />

      {failedNames.length > 0 && !dismissedNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)]">
          <span className="flex-1 min-w-0">
            {failedNames.length} source{failedNames.length > 1 ? 's' : ''} unreachable: {failedNames.join(', ')}
          </span>
          <button
            type="button"
            onClick={() => setDismissedNotice(true)}
            aria-label="Dismiss"
            className="shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-bg-card)] divide-y divide-[var(--color-border-faint)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[11px] text-[var(--color-text-secondary)]">
            No matching articles
          </div>
        ) : (
          filtered.map((item) => (
            <NewsRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
            />
          ))
        )}
      </div>
    </div>
  )
}
