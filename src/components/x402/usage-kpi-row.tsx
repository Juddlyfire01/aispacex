import type { UsageKpis } from '../../lib/cost/usage-analytics'

function fmtCost(n: number): string {
  if (!(n > 0)) return '$0.00'
  return `$${n.toFixed(n < 1 ? 4 : 2)}`
}

function fmtCount(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(2).replace(/\.?0+$/, '')}K`
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`
  return String(Math.round(n))
}

const CARDS: Array<{ key: keyof UsageKpis; label: string; format: (n: number) => string }> = [
  { key: 'totalCost', label: 'Total Cost', format: fmtCost },
  { key: 'totalPosts', label: 'Total Posts', format: fmtCount },
  { key: 'totalUsers', label: 'Total Profiles', format: fmtCount },
  { key: 'totalRequests', label: 'Total Requests', format: fmtCount },
]

/** Four KPI cards for Settings → Usage. */
export function UsageKpiRow({ kpis }: { kpis: UsageKpis }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {CARDS.map((c) => (
        <div
          key={c.key}
          className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-bg-elevated)] px-3.5 py-3"
        >
          <p className="text-[11px] text-[var(--color-text-tertiary)]">{c.label}</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-[var(--color-text-primary)]">
            {c.format(kpis[c.key])}
          </p>
        </div>
      ))}
    </div>
  )
}
