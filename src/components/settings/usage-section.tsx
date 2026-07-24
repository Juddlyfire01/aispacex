import { useMemo, useState } from 'react'
import { useCostLedgerStore } from '../../stores/cost-ledger-store'
import {
  allEvents,
  dailySeries,
  entriesInWindow,
  kpiTotals,
  usageRangeLabel,
  USAGE_WINDOW_DAYS,
  windowStartMs,
} from '../../lib/cost/usage-analytics'
import { USAGE_KIND_FILTERS } from '../../lib/x402/pricing'
import { UsageKpiRow } from '../x402/usage-kpi-row'
import { UsageCharts } from '../x402/usage-charts'
import { UsageAllEvents } from '../x402/usage-all-events'

/**
 * Settings → Usage: KPI cards, 30-day charts, All Events — derived from the
 * unified cost ledger (canonical).
 */
export function UsageSection() {
  const entries = useCostLedgerStore((s) => s.entries)
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [metric, setMetric] = useState<'cost' | 'count'>('cost')

  const sinceMs = useMemo(() => windowStartMs(USAGE_WINDOW_DAYS), [])
  const windowEntries = useMemo(
    () => entriesInWindow(entries, sinceMs),
    [entries, sinceMs],
  )
  const kpis = useMemo(() => kpiTotals(windowEntries), [windowEntries])
  const series = useMemo(
    () =>
      dailySeries(entries, {
        sinceMs,
        kind: kindFilter === 'all' ? undefined : kindFilter,
      }),
    [entries, sinceMs, kindFilter],
  )
  const events = useMemo(() => allEvents(windowEntries), [windowEntries])

  return (
    <div className="space-y-8">
      <p className="text-[13px] text-[var(--color-text-tertiary)] -mt-2">
        {usageRangeLabel(sinceMs)}
      </p>

      <UsageKpiRow kpis={kpis} />

      <UsageCharts
        series={series}
        kindFilter={kindFilter}
        onKindFilterChange={setKindFilter}
        metric={metric}
        onMetricChange={setMetric}
        kindOptions={USAGE_KIND_FILTERS}
      />

      <UsageAllEvents rows={events} />
    </div>
  )
}
