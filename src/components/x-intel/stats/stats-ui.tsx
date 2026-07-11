import type { ReactNode } from 'react'
import { cn } from '../../../lib/utils'
import type { VeniceChartPeriod, VeniceDataPoint } from '../../../lib/venicestats/types'
import { Tooltip } from '../../ui/tooltip'

// Interactive chart (hover crosshair + tooltip) shared with the Signal tab.
export { InteractiveChart as LineChart } from '../../ui/interactive-chart'

export function StatsSection({
  title,
  titleExtra,
  href,
  tip,
  children,
}: {
  title: string
  titleExtra?: ReactNode
  href?: string
  tip?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">
            <Tooltip tip={tip} underline={Boolean(tip)}>
              {title}
            </Tooltip>
          </h2>
          {titleExtra}
        </div>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors shrink-0"
          >
            View on VeniceStats →
          </a>
        )}
      </div>
      {children}
    </section>
  )
}

function CardLabel({ children, tip }: { children: ReactNode; tip?: string }) {
  return (
    <div className="min-w-0 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-secondary)] truncate">
      <Tooltip tip={tip}>{children}</Tooltip>
    </div>
  )
}

const cardHoverCls =
  'transition-colors hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent)]/[0.04]'

export function KpiCard({
  label,
  value,
  sub,
  delta,
  className,
  tip,
}: {
  label: string
  value: string
  sub?: string
  delta?: { text: string; positive?: boolean }
  className?: string
  tip?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--color-border-card)] bg-[var(--color-bg-card)] px-3.5 py-2.5 min-h-[5rem] flex flex-col justify-between',
        cardHoverCls,
        className,
      )}
    >
      <CardLabel tip={tip}>{label}</CardLabel>
      <div>
        <div className="text-[18px] font-semibold font-mono leading-tight text-[var(--color-text-primary)]">
          {value}
        </div>
        {delta && (
          <div className={cn('text-[11px] font-mono mt-0.5', delta.positive === true ? 'text-green-400/75' : delta.positive === false ? 'text-red-400/75' : 'text-[var(--color-text-secondary)]')}>
            {delta.text}
          </div>
        )}
        {sub && <div className="text-[10px] text-[var(--color-text-secondary)] font-mono mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export function ChartCard({
  title,
  children,
  className,
  tip,
}: {
  title: string
  children: ReactNode
  className?: string
  tip?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--color-border-card)] bg-[var(--color-bg-card)] p-3',
        cardHoverCls,
        className,
      )}
    >
      <div className="mb-2">
        <CardLabel tip={tip}>{title}</CardLabel>
      </div>
      {children}
    </div>
  )
}

/** Normalize API chart rows — simple `{t,v}` or burns buckets with a value key. */
export function normalizeChartSeries(
  raw: Array<{ t: number; v?: number; [key: string]: unknown }> | undefined,
  valueKey?: string,
): VeniceDataPoint[] {
  if (!raw?.length) return []
  return raw
    .map((p) => {
      let v = p.v
      if (!Number.isFinite(v) && valueKey) {
        const alt = p[valueKey]
        v = typeof alt === 'number' ? alt : NaN
      }
      return { t: p.t, v: v as number }
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
}

/**
 * Monthly buy-and-burn chart buckets include a live partial month (timestamp = now)
 * with organicUsd = 0 until the discretionary burn executes. Drop that trailing point
 * so the line doesn't cliff to zero mid-month.
 */
export function normalizeMonthlyBurnSeries(
  raw: Array<{ t: number; v?: number; organicUsd?: number; [key: string]: unknown }> | undefined,
): VeniceDataPoint[] {
  const series = normalizeChartSeries(raw, 'organicUsd')
  if (!series.length) return series
  const last = series[series.length - 1]!
  const lastDate = new Date(last.t)
  const now = new Date()
  const isCurrentMonth =
    lastDate.getUTCFullYear() === now.getUTCFullYear() &&
    lastDate.getUTCMonth() === now.getUTCMonth()
  if (isCurrentMonth && last.v === 0) return series.slice(0, -1)
  return series
}

/** Monthly burns are bucketed by calendar month — short chart periods only return 1–2 buckets. */
const MONTHLY_BURN_WINDOW: Record<VeniceChartPeriod, number | null> = {
  '7d': 6,
  '30d': 6,
  '90d': 4,
  '1y': 12,
  all: null,
}

export function monthlyBurnChartSeries(
  raw: Array<{ t: number; v?: number; organicUsd?: number; [key: string]: unknown }> | undefined,
  period: VeniceChartPeriod,
): VeniceDataPoint[] {
  let series = normalizeMonthlyBurnSeries(raw)
  const take = MONTHLY_BURN_WINDOW[period]
  if (take != null) series = series.slice(-take)
  return series
}

const PERIOD_OPTIONS = [
  ['7d', '7D'],
  ['30d', '30D'],
  ['90d', '90D'],
  ['1y', '1Y'],
  ['all', 'ALL'],
] as const

export function PeriodPicker<T extends string>({
  value,
  onChange,
}: {
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-px rounded-lg p-0.5 bg-[var(--color-bg-base)] border border-[var(--color-border-soft)]">
      {PERIOD_OPTIONS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id as T)}
          className={cn(
            'text-[10px] font-medium px-2 py-1 rounded-md transition-colors',
            value === id
              ? 'bg-[var(--color-bg-raised)] text-[var(--color-accent)] border border-[var(--color-accent)]/30'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
