import type { PerformanceGlance as PerformanceGlanceData } from '../../lib/x-intel/performance'
import { INTELX_SCORE_TIP } from '../../lib/x-intel/performance'
import { Tooltip } from '../ui/tooltip'

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(Math.round(n))
}

function formatDelta(n: number): string {
  if (n === 0) return '0'
  const sign = n > 0 ? '+' : '−'
  return `${sign}${formatCount(Math.abs(n))}`
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function PerfStat({
  label,
  value,
  sub,
  tip,
}: {
  label: string
  value: string
  sub?: string
  tip?: string
}) {
  const up = sub != null && sub.startsWith('+')
  const down = sub != null && (sub.startsWith('−') || sub.startsWith('-'))
  return (
    <div className="rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-bg-card)] px-2.5 py-2 min-h-[4.75rem] flex flex-col">
      <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
        {tip ? (
          <Tooltip tip={tip} side="bottom">
            {label}
          </Tooltip>
        ) : (
          label
        )}
      </div>
      <div className="text-[13px] font-mono text-[var(--color-text-primary)] mt-0.5">{value}</div>
      {/* Always reserve sub-line height so All (no Δ) matches 1d/7d/30d cards */}
      <div
        className={
          sub == null
            ? 'text-[10px] font-mono mt-0.5 min-h-[1.25rem] invisible select-none'
            : up
              ? 'text-[10px] font-mono text-emerald-400/80 mt-0.5 min-h-[1.25rem]'
              : down
                ? 'text-[10px] font-mono text-rose-400/70 mt-0.5 min-h-[1.25rem]'
                : 'text-[10px] font-mono text-[var(--color-text-tertiary)] mt-0.5 min-h-[1.25rem]'
        }
        aria-hidden={sub == null}
      >
        {sub ?? '\u00a0'}
      </div>
    </div>
  )
}

export function PerformanceGlance({ glance }: { glance: PerformanceGlanceData }) {
  const d = glance.delta
  const period = glance.isAllTime ? null : `vs prior ${glance.periodDays}d`
  /** Sub-line for All: no period Δ — show library scope instead of an empty row. */
  const allTimeSub = 'library total'
  const metricSub = (delta: number) =>
    period != null ? formatDelta(delta) : allTimeSub
  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-[10px] text-[var(--color-text-tertiary)]">
        {glance.isAllTime
          ? 'Library totals · all gathered posts (not full X history)'
          : `Totals for posts created in this window · ${period}`}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <PerfStat
          label="Xintel score"
          tip={INTELX_SCORE_TIP}
          value={formatCount(glance.current.xScore)}
          sub={period != null ? `${formatDelta(d.xScore)} ${period}` : allTimeSub}
        />
        <PerfStat
          label="Views"
          value={formatCount(glance.current.impressions)}
          sub={metricSub(d.impressions)}
        />
        <PerfStat
          label="Likes"
          value={formatCount(glance.current.likes)}
          sub={metricSub(d.likes)}
        />
        <PerfStat
          label="Replies"
          value={formatCount(glance.current.replies)}
          sub={metricSub(d.replies)}
        />
        <PerfStat
          label="Reposts"
          value={formatCount(glance.current.reposts)}
          sub={metricSub(d.reposts)}
        />
        <PerfStat
          label="Quotes"
          value={formatCount(glance.current.quotes)}
          sub={metricSub(d.quotes)}
        />
        <PerfStat
          label="Bookmarks"
          value={formatCount(glance.current.bookmarks)}
          sub={metricSub(d.bookmarks)}
        />
        <PerfStat
          label="Followers"
          value={glance.followers != null ? formatCount(glance.followers) : '—'}
          sub={
            glance.followersDelta != null
              ? `${formatDelta(glance.followersDelta)} ~${glance.periodDays}d`
              : glance.isAllTime
                ? 'current'
                : 'gather again for Δ'
          }
        />
      </div>
      <p className="text-[10px] text-[var(--color-text-quaternary)]">
        Leading kind by{' '}
        <Tooltip tip={INTELX_SCORE_TIP} side="top" underline>
          Xintel score
        </Tooltip>
        : {capitalize(glance.leadingKind)} · pure retweets excluded · approximation from public
        metrics (not X live ranking)
      </p>
    </div>
  )
}
