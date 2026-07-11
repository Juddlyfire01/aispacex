import { useMemo, useState } from 'react'
import { useBuzz } from '../../hooks/use-venicestats'
import type { BuzzItem, BuzzItemType } from '../../lib/venicestats/signal-types'
import { fmtCompact, relTime } from '../../lib/venicestats/format'
import { SegmentedControl } from '../ui/sub-tabs'
import { LoadingState } from '../ui/spinner'
import { cn } from '../../lib/utils'

type TypeFilter = 'all' | BuzzItemType

const TYPE_OPTIONS = [
  ['all', 'All'],
  ['tweet', 'Tweets'],
  ['article', 'Articles'],
  ['video', 'Videos'],
] as const

const TYPE_BADGE: Record<BuzzItemType, string> = {
  tweet: 'Tweet',
  article: 'Article',
  video: 'Video',
}

/** Strip trailing t.co link noise and stray whitespace from tweet titles. */
function cleanTitle(title: string): string {
  return title
    .replace(/https?:\/\/t\.co\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function engagement(item: BuzzItem): number {
  return (item.likeCount ?? 0) + (item.retweetCount ?? 0)
}

/**
 * Smart curation: keep non-tweets and tweets with at least some engagement,
 * ranked by engagement then recency. "Show all" reveals the raw
 * chronological stream.
 */
function curate(items: BuzzItem[], showAll: boolean): BuzzItem[] {
  if (showAll) return items
  const kept = items.filter((i) => i.type !== 'tweet' || engagement(i) > 0)
  return kept.sort((a, b) => {
    const diff = engagement(b) - engagement(a)
    if (diff !== 0) return diff
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  })
}

function FeedRow({ item }: { item: BuzzItem }) {
  const title = cleanTitle(item.title) || item.summary || '(no text)'
  const eng = engagement(item)
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-3.5 py-2.5 hover:bg-[var(--color-accent)]/[0.04] transition-colors group"
    >
      <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
        {item.authorHandle ? (
          <span className="font-medium text-[var(--color-text-primary)]">@{item.authorHandle}</span>
        ) : (
          <span className="font-medium text-[var(--color-text-primary)]">{item.sourceName ?? 'Unknown'}</span>
        )}
        <span className={cn(
          'rounded-full border border-[var(--color-border-soft)] px-1.5 py-px text-[9px] uppercase tracking-[0.05em]',
          item.type !== 'tweet' && 'text-[var(--color-accent)] border-[var(--color-accent)]/30',
        )}>
          {TYPE_BADGE[item.type] ?? item.type}
        </span>
        <span className="ml-auto shrink-0 font-mono">{relTime(item.publishedAt)}</span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-[var(--color-text-primary)] line-clamp-3 group-hover:text-[var(--color-accent)] transition-colors">
        {title}
      </p>
      {eng > 0 && (
        <div className="mt-1 text-[10px] font-mono text-[var(--color-text-secondary)]">
          {item.likeCount > 0 && <span>{fmtCompact(item.likeCount, 0)} likes</span>}
          {item.likeCount > 0 && item.retweetCount > 0 && <span> · </span>}
          {item.retweetCount > 0 && <span>{fmtCompact(item.retweetCount, 0)} RTs</span>}
        </div>
      )}
    </a>
  )
}

export function BuzzFeed() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [showAll, setShowAll] = useState(false)
  const buzz = useBuzz(typeFilter === 'all' ? undefined : typeFilter, 50)

  const items = useMemo(
    () => curate(buzz.data?.items ?? [], showAll),
    [buzz.data, showAll],
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <SegmentedControl options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} size="sm" className="w-auto" />
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className={cn(
            'text-[10px] font-medium px-2.5 py-1 rounded-md border transition-colors',
            showAll
              ? 'text-[var(--color-accent)] border-[var(--color-accent)]/30 bg-[var(--color-accent)]/[0.06]'
              : 'text-[var(--color-text-secondary)] border-[var(--color-border-soft)] hover:text-[var(--color-text-primary)]',
          )}
        >
          {showAll ? 'Showing all' : 'Show all'}
        </button>
      </div>

      <div className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-bg-card)] divide-y divide-[var(--color-border-faint)] overflow-hidden">
        {buzz.isPending ? (
          <LoadingState className="h-32" label="Loading…" size="sm" />
        ) : buzz.isError ? (
          <div className="flex items-center justify-center h-24 text-[11px] text-[var(--color-text-secondary)]">
            Could not load the buzz feed
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[11px] text-[var(--color-text-secondary)]">
            {showAll ? 'No items' : 'No high-signal items right now — try "Show all"'}
          </div>
        ) : (
          items.map((item) => <FeedRow key={item.sourceId} item={item} />)
        )}
      </div>
      {!showAll && !buzz.isLoading && !buzz.isError && (
        <p className="mt-1.5 text-[10px] text-[var(--color-text-secondary)]">
          Curated view — low-engagement posts hidden. {buzz.data ? `${fmtCompact(buzz.data.total, 1)} total tracked mentions.` : ''}
        </p>
      )}
    </div>
  )
}
