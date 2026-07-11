import type { NewsItem } from '../../lib/news/types'
import { relTime } from '../../lib/venicestats/format'

export function LatestStrip({ items }: { items: NewsItem[] }) {
  const latest = items.filter((i) => i.publishedAt).slice(0, 5)
  if (latest.length === 0) return null
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
      {latest.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 w-56 rounded-xl border border-[var(--color-border-card)] bg-[var(--color-bg-card)] p-3 hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent)]/[0.04] transition-colors"
        >
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
            <span className="font-medium text-[var(--color-text-primary)] truncate">{item.sourceName}</span>
            <span className="ml-auto shrink-0 font-mono">{relTime(item.publishedAt)}</span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-[var(--color-text-primary)] line-clamp-3">{item.title}</p>
        </a>
      ))}
    </div>
  )
}
