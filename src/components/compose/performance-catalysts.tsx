import type { CatalystResult } from '../../lib/x-intel/performance'
import { xWeightedScore } from '../../lib/x-intel/performance'
import { postUrl } from '../../lib/x-intel/evidence'

function clampText(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(Math.round(n))
}

export function PerformanceCatalysts({ catalyst }: { catalyst: CatalystResult }) {
  return (
    <section className="px-4 pt-3 pb-4 border-t border-[var(--color-border-faint)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        Likely catalysts
      </h3>
      <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{catalyst.caption}</p>
      <ul className="mt-2 space-y-1.5">
        {catalyst.posts.map((post) => (
          <li key={post.id} className="flex items-start gap-2 text-[11px]">
            <span className="shrink-0 mt-px px-1.5 py-px rounded-full text-[10px] capitalize bg-[var(--color-bg-card)] border border-[var(--color-border-faint)] text-[var(--color-text-tertiary)]">
              {post.kind}
            </span>
            <a
              href={postUrl(post.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="entity-link min-w-0 flex-1 truncate text-[var(--color-text-primary)]"
            >
              {clampText(post.text || '(empty)', 120)}
            </a>
            <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-tertiary)]">
              {formatCount(xWeightedScore(post))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
