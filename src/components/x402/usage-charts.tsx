import type { DailyPoint } from '../../lib/cost/usage-analytics'
import { cn } from '../../lib/utils'

function fmtDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(n > 0 && n < 1 ? 2 : 2)}`
}

type KindOption = { kind: string; label: string }

/**
 * Usage Cost (bars) + Requests (line) for the last 30 days.
 * Kind filter applies to both charts. Metric toggle switches the bar chart
 * between charged USD and request counts.
 */
export function UsageCharts({
  series,
  kindFilter,
  onKindFilterChange,
  metric,
  onMetricChange,
  kindOptions,
}: {
  series: DailyPoint[]
  kindFilter: string
  onKindFilterChange: (kind: string) => void
  metric: 'cost' | 'count'
  onMetricChange: (m: 'cost' | 'count') => void
  kindOptions: KindOption[]
}) {
  const barValues = series.map((p) => (metric === 'cost' ? p.chargedUsd : p.requests))
  const maxBar = Math.max(1, ...barValues)
  const maxReq = Math.max(1, ...series.map((p) => p.requests))

  const filter = (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="usage-kind-filter">
        Resource kind
      </label>
      <select
        id="usage-kind-filter"
        value={kindFilter}
        onChange={(e) => onKindFilterChange(e.target.value)}
        className="text-[12px] rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-base)] text-[var(--color-text-secondary)] px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <option value="all">All</option>
        {kindOptions.map((o) => (
          <option key={o.kind} value={o.kind}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex rounded-md border border-[var(--color-border-soft)] overflow-hidden">
        <button
          type="button"
          aria-pressed={metric === 'cost'}
          onClick={() => onMetricChange('cost')}
          className={cn(
            'px-2 py-1 text-[11px] font-medium tabular-nums',
            metric === 'cost'
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]',
          )}
          title="Show cost"
        >
          $
        </button>
        <button
          type="button"
          aria-pressed={metric === 'count'}
          onClick={() => onMetricChange('count')}
          className={cn(
            'px-2 py-1 text-[11px] font-medium',
            metric === 'count'
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]',
          )}
          title="Show request counts"
        >
          #
        </button>
      </div>
    </div>
  )

  const tickIdx = series.length <= 1 ? [] : [0, Math.floor((series.length - 1) / 2), series.length - 1]

  function AxisLabels() {
    return (
      <div className="mt-2 flex justify-between text-[10px] text-[var(--color-text-tertiary)]">
        {tickIdx.map((i) => (
          <span key={series[i].day}>{fmtDay(series[i].day)}</span>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
      <section className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-bg-elevated)] p-4 flex flex-col h-full">
        <div className="flex items-start justify-between gap-3 mb-4 min-h-[2.75rem]">
          <div>
            <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">
              Usage Cost (last 30 days)
            </h3>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              {metric === 'cost' ? 'Charged USD by day' : 'Requests by day'}
            </p>
          </div>
          {filter}
        </div>
        <div className="flex items-end gap-px h-36" role="img" aria-label="Usage cost bar chart">
          {series.map((p, i) => {
            const v = barValues[i]
            const h = Math.max(v > 0 ? 2 : 0, (v / maxBar) * 100)
            return (
              <div
                key={p.day}
                className="flex-1 min-w-0 flex flex-col justify-end h-full group relative"
                title={`${fmtDay(p.day)}: ${metric === 'cost' ? fmtUsd(p.chargedUsd) : p.requests}`}
              >
                <div
                  className="w-full rounded-t-sm bg-[var(--color-accent)]/80 group-hover:bg-[var(--color-accent)] transition-colors"
                  style={{ height: `${h}%` }}
                />
              </div>
            )
          })}
        </div>
        <AxisLabels />
      </section>

      <section className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-bg-elevated)] p-4 flex flex-col h-full">
        <div className="flex items-start justify-between gap-3 mb-4 min-h-[2.75rem]">
          <div>
            <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">
              Requests (last 30 days)
            </h3>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              Ledger entries per day
            </p>
          </div>
        </div>
        <RequestsLine series={series} maxReq={maxReq} />
        <AxisLabels />
      </section>
    </div>
  )
}

function RequestsLine({ series, maxReq }: { series: DailyPoint[]; maxReq: number }) {
  const w = 300
  const h = 144
  const pad = 4
  if (series.length === 0) {
    return <div className="h-36 text-[12px] text-[var(--color-text-tertiary)]">No data</div>
  }
  const points = series.map((p, i) => {
    const x = pad + (i / Math.max(1, series.length - 1)) * (w - pad * 2)
    const y = h - pad - (p.requests / maxReq) * (h - pad * 2)
    return `${x},${y}`
  })
  const area = `${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="block w-full h-36"
      role="img"
      aria-label="Requests line chart"
      preserveAspectRatio="none"
    >
      <polygon points={area} fill="var(--color-accent)" opacity="0.15" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
