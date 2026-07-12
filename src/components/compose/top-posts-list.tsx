import type {
  PerformanceRankMode,
  ScoredPost,
} from '../../lib/x-intel/performance'
import { postUrl } from '../../lib/x-intel/evidence'

function primaryMetricLabel(item: ScoredPost, mode: PerformanceRankMode): string {
  if (mode === 'engagement_rate') return `${(item.metricForMode * 100).toFixed(1)}%`
  if (mode === 'amplification') return String(Math.round(item.metricForMode))
  if (mode === 'likes') return String(Math.round(item.metricForMode))
  return item.multipleOfMedian != null ? `${item.multipleOfMedian}×` : item.score.toFixed(2)
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function clampText(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

export function TopPostsList({
  items,
  mode,
  expandedId,
  onExpand,
}: {
  items: ScoredPost[]
  mode: PerformanceRankMode
  expandedId: string | null
  onExpand: (id: string) => void
}) {
  if (items.length === 0) return null

  return (
    <ul className="border-t border-[var(--color-border-faint)]">
      {items.map((item) => {
        const { post } = item
        const expanded = expandedId === post.id
        return (
          <li
            key={post.id}
            className={
              item.belowThreshold
                ? 'border-b border-[var(--color-border-faint)] opacity-50'
                : 'border-b border-[var(--color-border-faint)]'
            }
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => onExpand(post.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onExpand(post.id)
                }
              }}
              className="w-full text-left px-4 py-2 cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex-1 min-w-0 truncate text-[12px] text-[var(--color-text-primary)]">
                  {post.text || '(empty)'}
                </span>
                <span className="shrink-0 text-[10px] capitalize text-[var(--color-text-tertiary)]">
                  {post.kind}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-secondary)]">
                  {primaryMetricLabel(item, mode)}
                </span>
                {mode !== 'composite' && item.multipleOfMedian != null && (
                  <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                    {item.multipleOfMedian}×
                  </span>
                )}
              </div>

              {expanded && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[12px] leading-snug text-[var(--color-text-primary)] whitespace-pre-wrap">
                    {clampText(post.text || '(empty)', 280)}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--color-text-secondary)]">
                    <span>{formatCount(post.metrics.impressions)} views</span>
                    <span>{formatCount(post.metrics.likes)} likes</span>
                    <span>{formatCount(post.metrics.reposts)} reposts</span>
                    <span>{formatCount(post.metrics.replies)} replies</span>
                    <span>{formatCount(post.metrics.quotes)} quotes</span>
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
                    className="inline-block text-[11px] text-[var(--color-accent)] hover:underline"
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
