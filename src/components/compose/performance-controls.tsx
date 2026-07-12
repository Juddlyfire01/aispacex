import { PillGroup } from '../ui/shared'
import type { PerformanceRankMode, PerformanceWindow } from '../../lib/x-intel/performance'

const WINDOWS: { value: PerformanceWindow; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
]

const MODES: { value: PerformanceRankMode; label: string }[] = [
  { value: 'composite', label: 'Composite' },
  { value: 'engagement_rate', label: 'Eng. rate' },
  { value: 'amplification', label: 'Amplification' },
  { value: 'likes', label: 'Likes' },
]

export function PerformanceControls({
  window,
  mode,
  onWindow,
  onMode,
}: {
  window: PerformanceWindow
  mode: PerformanceRankMode
  onWindow: (w: PerformanceWindow) => void
  onMode: (m: PerformanceRankMode) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-[var(--color-border-faint)]">
      <PillGroup
        ariaLabel="Time window"
        options={WINDOWS}
        value={window}
        onChange={(v) => onWindow(v as PerformanceWindow)}
      />
      <PillGroup
        ariaLabel="Rank by"
        options={MODES}
        value={mode}
        onChange={(v) => onMode(v as PerformanceRankMode)}
      />
    </div>
  )
}
