import { useMemo, useState } from 'react'
import type { BuzzMetrics, BuzzWeekPoint } from '../../lib/venicestats/signal-types'
import { fmtChartAxis, fmtCompact } from '../../lib/venicestats/format'
import { InteractiveChart, type ChartAnnotation } from '../ui/interactive-chart'
import { SegmentedControl } from '../ui/sub-tabs'
import { ChartCard } from '../x-intel/stats/stats-ui'
import { cn } from '../../lib/utils'

type Metric = 'reach' | 'mentions' | 'engagement'

const METRIC_OPTIONS = [
  ['reach', 'Reach'],
  ['mentions', 'Mentions'],
  ['engagement', 'Engagement'],
] as const

type RangeId = '12w' | '26w' | '52w' | 'all'

const RANGE_OPTIONS: Array<[RangeId, string, number | null]> = [
  ['12w', '12W', 12],
  ['26w', '26W', 26],
  ['52w', '52W', 52],
  ['all', 'ALL', null],
]

const METRIC_META: Record<Metric, { color: string; tip: string }> = {
  reach: { color: 'var(--color-accent)', tip: 'Weekly views across all Venice mentions on X.' },
  mentions: { color: '#34d399', tip: 'Weekly count of Venice mentions on X.' },
  engagement: { color: '#f97316', tip: 'Weekly likes, retweets, replies and bookmarks on Venice mentions.' },
}

/** Points > 3x the trailing-8-week median are flagged as spikes. */
function findSpikes(series: BuzzWeekPoint[]): ChartAnnotation[] {
  const spikes: ChartAnnotation[] = []
  for (let i = 0; i < series.length; i++) {
    const windowVals = series
      .slice(Math.max(0, i - 8), i)
      .map((p) => p.v)
      .sort((a, b) => a - b)
    if (windowVals.length < 4) continue
    const median = windowVals[Math.floor(windowVals.length / 2)]
    if (median > 0 && series[i].v > median * 3) {
      spikes.push({ t: series[i].t, label: `spike · ${fmtCompact(series[i].v, 1)}` })
    }
  }
  return spikes
}

export function MomentumChart({ m }: { m: BuzzMetrics }) {
  const [metric, setMetric] = useState<Metric>('reach')
  const [range, setRange] = useState<RangeId>('26w')

  const fullSeries = useMemo(() => {
    const raw =
      metric === 'reach' ? m.viewsByWeek : metric === 'mentions' ? m.mentionsByWeek : m.engagementByWeek
    // The API returns all-time regardless of the weeks param — slice client-side.
    return raw.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
  }, [m, metric])

  const series = useMemo(() => {
    const take = RANGE_OPTIONS.find(([id]) => id === range)?.[2]
    return take != null ? fullSeries.slice(-take) : fullSeries
  }, [fullSeries, range])

  // Detect spikes on the full series so trailing context is accurate, then
  // keep only ones visible in the selected range.
  const annotations = useMemo(() => {
    const startT = series[0]?.t ?? 0
    return findSpikes(fullSeries).filter((a) => a.t >= startT)
  }, [fullSeries, series])

  const meta = METRIC_META[metric]

  return (
    <ChartCard title="Narrative momentum" tip={meta.tip}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <SegmentedControl options={METRIC_OPTIONS} value={metric} onChange={setMetric} size="sm" className="w-auto" />
        <div className="flex gap-px rounded-lg p-0.5 bg-[var(--color-bg-base)] border border-[var(--color-border-soft)]">
          {RANGE_OPTIONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={cn(
                'text-[10px] font-medium px-2 py-1 rounded-md transition-colors',
                range === id
                  ? 'bg-[var(--color-bg-raised)] text-[var(--color-accent)] border border-[var(--color-accent)]/30'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <InteractiveChart
        data={series}
        color={meta.color}
        height={220}
        formatY={(n, r) => fmtChartAxis(n, { range: r })}
        formatValue={(n) => fmtCompact(n, 1)}
        annotations={annotations}
      />
    </ChartCard>
  )
}
