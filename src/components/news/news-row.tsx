import type { NewsItem } from '../../lib/news/types'
import { relTime } from '../../lib/venicestats/format'
import { useNewsStore } from '../../stores/news-store'
import { cn } from '../../lib/utils'
import { Tldr } from './tldr'

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  )
}

export function NewsRow({ item, expanded, onToggle }: {
  item: NewsItem
  expanded: boolean
  onToggle: () => void
}) {
  const isBookmarked = useNewsStore((s) => s.isBookmarked(item.url))
  const toggleBookmark = useNewsStore((s) => s.toggleBookmark)

  return (
    <div className="px-3.5 py-2.5">
      <button type="button" onClick={onToggle} className="w-full text-left group">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
          <span className="font-medium text-[var(--color-text-primary)]">{item.sourceName}</span>
          <span className="rounded-full border border-[var(--color-border-soft)] px-1.5 py-px text-[9px] uppercase tracking-[0.05em]">
            {item.category}
          </span>
          <span className="ml-auto shrink-0 font-mono">{relTime(item.publishedAt)}</span>
        </div>
        <div className="mt-1 flex gap-3">
          {item.imageUrl && !expanded && (
            <img src={item.imageUrl} alt="" loading="lazy" className="h-12 w-16 rounded-md object-cover shrink-0" />
          )}
          <p className={cn(
            'text-[13px] leading-snug text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors',
            !expanded && 'line-clamp-2',
          )}>
            {item.title}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="mt-2.5 space-y-2.5 animate-fade-in">
          {item.imageUrl && (
            <img src={item.imageUrl} alt="" loading="lazy" className="w-full max-h-56 rounded-lg object-cover" />
          )}
          {item.summary && (
            <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">{item.summary}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-[var(--color-accent)]/[0.1] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/[0.16] transition-colors"
            >
              Read full article ↗
            </a>
            <Tldr url={item.url} title={item.title} excerpt={item.summary} />
            <button
              type="button"
              onClick={() => toggleBookmark(item)}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              className={cn(
                'ml-auto p-1.5 rounded-md transition-colors',
                isBookmarked ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              <BookmarkIcon filled={isBookmarked} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
