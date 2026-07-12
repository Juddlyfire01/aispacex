import type { PerformanceGlance as PerformanceGlanceData } from '../../lib/x-intel/performance'

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function PerfStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-bg-card)] px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
        {label}
      </div>
      <div className="text-[13px] font-mono text-[var(--color-text-primary)] mt-0.5">{value}</div>
    </div>
  )
}

export function PerformanceGlance({ glance }: { glance: PerformanceGlanceData }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3">
      <PerfStat
        label="Eng. rate"
        value={`${(glance.engagementRate * 100).toFixed(1)}%`}
      />
      <PerfStat label="Top posts" value={String(glance.topPostCount)} />
      <PerfStat label="Leading kind" value={capitalize(glance.leadingKind)} />
      <PerfStat
        label="vs median"
        value={glance.vsMedian != null ? `${glance.vsMedian}×` : '—'}
      />
    </div>
  )
}
