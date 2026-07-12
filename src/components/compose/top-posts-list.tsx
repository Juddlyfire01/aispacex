import type {
  PerformanceRankMode,
  ScoredPost,
} from '../../lib/x-intel/performance'
import { postUrl } from '../../lib/x-intel/evidence'
import { cn } from '../../lib/utils'

function primaryMetricLabel(item: ScoredPost, mode: PerformanceRankMode): string {
  if (mode === 'composite') {
    return item.metricForMode >= 100
      ? String(Math.round(item.metricForMode))
      : item.metricForMode.toFixed(1)
  }
  return String(Math.round(item.metricForMode))
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim() || '(empty)'
}

export function TopPostsList({
  items,
  mode,
  expandedId,
  onToggle,
}: {
  items: ScoredPost[]
  mode: PerformanceRankMode
  expandedId: string | null
  /** Accordion: open this id, or close if already open. */
  onToggle: (id: string) => void
}) {
  if (items.length === 0) return null

  return (
    <ul className="border-t border-[var(--color-border-faint)]">
      {items.map((item) => {
        const { post } = item
        const expanded = expandedId === post.id
        const text = oneLine(post.text || '')
        return (
          <li key={post.id} className="border-b border-[var(--color-border-faint)]">
            <div
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              onClick={() => onToggle(post.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle(post.id)
                }
              }}
              className="w-full text-left px-4 py-2 cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <div className="flex items-start gap-2 min-w-0">
                <span
                  className={cn(
                    'flex-1 min-w-0 text-[12px] text-[var(--color-text-primary)]',
                    expanded ? 'leading-snug line-clamp-4' : 'truncate',
                  )}
                >
                  {text}
                </span>
                <span className="shrink-0 flex items-center gap-2 pt-0.5">
                  <span className="text-[10px] capitalize text-[var(--color-text-tertiary)]">
                    {post.kind}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                    {primaryMetricLabel(item, mode)}
                  </span>
                  {item.multipleOfMedian != null && (
                    <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                      {item.multipleOfMedian}×
                    </span>
                  )}
                </span>
              </div>

              {expanded && (
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--color-text-secondary)]">
                    <span>{formatCount(post.metrics.impressions)} views</span>
                    <span>{formatCount(post.metrics.likes)} likes</span>
                    <span>{formatCount(post.metrics.reposts)} reposts</span>
                    <span>{formatCount(post.metrics.replies)} replies</span>
                    <span>{formatCount(post.metrics.quotes)} quotes</span>
                    <span>{formatCount(post.metrics.bookmarks)} bookmarks</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">{item.why}</p>
                  {item.amplifiers.length > 0 && (
                    <p className="text-[11px] text-[var(--color-text-tertiary)]">
                      amplified by{' '}
                      {item.amplifiers.map((h) => `@${h.replace(/^@/, '')}`).join(', ')}
                    </p>
                  )}
                  <a
                    href={postUrl(post.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="entity-link inline-block text-[11px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open on X
                  </a>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
