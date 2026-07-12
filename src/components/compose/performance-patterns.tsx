import type { PerformancePatterns as PerformancePatternsData } from '../../lib/x-intel/performance'

function clampText(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

export function PerformancePatterns({ patterns }: { patterns: PerformancePatternsData }) {
  const visible = patterns.byKind.filter((r) => r.count > 0)
  const rows = visible.length > 0 ? visible : patterns.byKind
  const maxAvg = Math.max(0, ...rows.map((r) => r.avgScore))

  return (
    <section className="px-4 pt-3 pb-4 border-t border-[var(--color-border-faint)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        Patterns
      </h3>
      <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{patterns.caption}</p>

      <div className="mt-3 space-y-1.5">
        {rows.map((row) => {
          const pct = maxAvg > 0 ? (row.avgScore / maxAvg) * 100 : 0
          return (
            <div key={row.kind} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] capitalize text-[var(--color-text-secondary)]">
                {row.kind}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border-faint)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)]/60"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-[10px] text-[var(--color-text-tertiary)]">
                {row.avgScore.toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>

      {patterns.examples.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {patterns.examples.slice(0, 3).map((post) => (
            <li
              key={post.id}
              className="flex items-start gap-2 text-[11px] text-[var(--color-text-secondary)]"
            >
              <span className="shrink-0 mt-px px-1.5 py-px rounded-full text-[10px] capitalize bg-[var(--color-bg-card)] border border-[var(--color-border-faint)] text-[var(--color-text-tertiary)]">
                {post.kind}
              </span>
              <span className="min-w-0 truncate text-[var(--color-text-primary)]">
                {clampText(post.text || '(empty)', 100)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
