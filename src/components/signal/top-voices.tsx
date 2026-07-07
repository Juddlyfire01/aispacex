import type { TopAuthor } from '../../lib/venicestats/signal-types'
import { fmtCompact } from '../../lib/venicestats/format'

/** Ranked "who's driving the conversation" list from buzz metrics topAuthors. */
export function TopVoices({ authors, limit = 10 }: { authors: TopAuthor[]; limit?: number }) {
  const top = authors.slice(0, limit)
  if (!top.length) {
    return (
      <div className="flex items-center justify-center h-24 text-[11px] text-[var(--color-text-secondary)]">
        No author data
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-bg-raised)] divide-y divide-[var(--color-border-faint)]">
      {top.map((a, i) => (
        <a
          key={a.handle}
          href={`https://x.com/${a.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3.5 py-2 hover:bg-[var(--color-accent)]/[0.04] transition-colors group"
        >
          <span className="w-5 shrink-0 text-[11px] font-mono text-[var(--color-text-secondary)] text-right">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
              @{a.handle}
            </div>
            <div className="text-[10px] font-mono text-[var(--color-text-secondary)]">
              {fmtCompact(a.count, 0)} posts · {fmtCompact(a.totalViews, 1)} views
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[12px] font-semibold font-mono text-[var(--color-text-primary)]">
              {fmtCompact(a.buzzScore, 1)}
            </div>
            <div className="text-[9px] uppercase tracking-[0.06em] text-[var(--color-text-secondary)]">buzz</div>
          </div>
        </a>
      ))}
    </div>
  )
}
