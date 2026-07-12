import { InteractiveChart } from '../ui/interactive-chart'
import type { PerformanceRankMode, SeriesPoint } from '../../lib/x-intel/performance'
import { MODE_LABEL } from '../../lib/x-intel/performance'

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(Math.round(n))
}

export function PerformanceChart({
  series,
  mode,
}: {
  series: SeriesPoint[]
  mode: PerformanceRankMode
}) {
  if (series.length < 2) {
    return (
      <div className="px-4 pb-2">
        <p className="text-[11px] text-[var(--color-text-tertiary)]">
          Need posts on more than one day for a trend line.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-3">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Over time
        </h3>
        <span className="text-[10px] text-[var(--color-text-tertiary)]">
          Daily {MODE_LABEL[mode]} (posts created that day)
        </span>
      </div>
      <div className="rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-bg-card)] px-2 py-2">
        <InteractiveChart
          data={series}
          height={120}
          formatY={(n) => formatCount(n)}
          formatValue={(n) => formatCount(n)}
        />
      </div>
    </div>
  )
}
