import { PillGroup } from '../ui/shared'
import { Select } from '../ui/select'
import { Tooltip } from '../ui/tooltip'
import {
  INTELX_SCORE_TIP,
  type PerformanceRankMode,
  type PerformanceWindow,
} from '../../lib/x-intel/performance'

/** High-frequency windows stay as one-click pills; custom is opt-in. */
const WINDOWS: { value: PerformanceWindow; label: string }[] = [
  { value: '1d', label: '1d' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
  { value: 'range', label: 'Custom' },
]

const MODES: { value: PerformanceRankMode; label: string }[] = [
  { value: 'composite', label: 'IntelX score' },
  { value: 'impressions', label: 'Views' },
  { value: 'likes', label: 'Likes' },
  { value: 'reposts', label: 'Reposts' },
  { value: 'replies', label: 'Replies' },
  { value: 'quotes', label: 'Quotes' },
  { value: 'bookmarks', label: 'Bookmarks' },
]

const dateInputClass =
  'bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-1.5 py-1 text-[11px] text-white/70 outline-none focus:border-[var(--color-border-strong)]'

export function PerformanceControls({
  window,
  mode,
  onWindow,
  onMode,
  rangeFrom,
  rangeTo,
  onRangeFrom,
  onRangeTo,
}: {
  window: PerformanceWindow
  mode: PerformanceRankMode
  onWindow: (w: PerformanceWindow) => void
  onMode: (m: PerformanceRankMode) => void
  rangeFrom: string
  rangeTo: string
  onRangeFrom: (v: string) => void
  onRangeTo: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 border-b border-[var(--color-border-faint)]">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <PillGroup
          ariaLabel="Time window"
          options={WINDOWS}
          value={window}
          onChange={(v) => onWindow(v as PerformanceWindow)}
        />
        {window === 'range' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)]">
              <span>From</span>
              <input
                type="date"
                value={rangeFrom}
                max={rangeTo || undefined}
                onChange={(e) => onRangeFrom(e.target.value)}
                className={dateInputClass}
                aria-label="Range start date"
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)]">
              <span>To</span>
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom || undefined}
                onChange={(e) => onRangeTo(e.target.value)}
                className={dateInputClass}
                aria-label="Range end date"
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Rank by
        </span>
        <Select
          value={mode}
          onChange={(v) => onMode(v as PerformanceRankMode)}
          options={MODES}
          className="w-[10.5rem] [&_button]:py-1 [&_button]:text-[12px] [&_button]:px-2 [&_span]:text-[12px]"
        />
        {mode === 'composite' && (
          <Tooltip tip={INTELX_SCORE_TIP} side="bottom" underline={false}>
            <span
              className="shrink-0 text-[10px] text-[var(--color-text-quaternary)] cursor-help"
              aria-label="About IntelX score"
            >
              ?
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
