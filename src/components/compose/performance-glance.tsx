import type { PerformanceGlance as PerformanceGlanceData } from '../../lib/x-intel/performance'

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
}: {
  label: string
  value: string
  sub?: string
}) {
  const up = sub?.startsWith('+')
  const down = sub?.startsWith('−') || sub?.startsWith('-')
  return (
    <div className="rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-bg-card)] px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
        {label}
      </div>
      <div className="text-[13px] font-mono text-[var(--color-text-primary)] mt-0.5">{value}</div>
      {sub != null && (
        <div
          className={
            up
              ? 'text-[10px] font-mono text-emerald-400/80 mt-0.5'
              : down
                ? 'text-[10px] font-mono text-rose-400/70 mt-0.5'
                : 'text-[10px] font-mono text-[var(--color-text-tertiary)] mt-0.5'
          }
        >
          {sub}
        </div>
      )}
    </div>
  )
}

export function PerformanceGlance({ glance }: { glance: PerformanceGlanceData }) {
  const d = glance.delta
  const period = `vs prior ${glance.periodDays}d`
  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-[10px] text-[var(--color-text-tertiary)]">
        Totals for posts created in the last {glance.periodDays}d · {period}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <PerfStat
          label="X-score"
          value={formatCount(glance.current.xScore)}
          sub={`${formatDelta(d.xScore)} ${period}`}
        />
        <PerfStat
          label="Views"
          value={formatCount(glance.current.impressions)}
          sub={formatDelta(d.impressions)}
        />
        <PerfStat
          label="Likes"
          value={formatCount(glance.current.likes)}
          sub={formatDelta(d.likes)}
        />
        <PerfStat
          label="Replies"
          value={formatCount(glance.current.replies)}
          sub={formatDelta(d.replies)}
        />
        <PerfStat
          label="Reposts"
          value={formatCount(glance.current.reposts)}
          sub={formatDelta(d.reposts)}
        />
        <PerfStat
          label="Quotes"
          value={formatCount(glance.current.quotes)}
          sub={formatDelta(d.quotes)}
        />
        <PerfStat
          label="Bookmarks"
          value={formatCount(glance.current.bookmarks)}
          sub={formatDelta(d.bookmarks)}
        />
        <PerfStat
          label="Followers"
          value={glance.followers != null ? formatCount(glance.followers) : '—'}
          sub={
            glance.followersDelta != null
              ? `${formatDelta(glance.followersDelta)} ~${glance.periodDays}d`
              : 'gather again for Δ'
          }
        />
      </div>
      <p className="text-[10px] text-[var(--color-text-quaternary)]">
        Leading kind by X-score: {capitalize(glance.leadingKind)} · X-score uses 2023 public weights
        (likes cheap, replies/conversation heavy)
      </p>
    </div>
  )
}
