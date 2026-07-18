import type { LibraryMode, PackResult } from '../../lib/compose/hot-window'
import type { LibraryCounts } from '../../lib/intel-library/types'
import { formatTokens } from '../../lib/utils'

export interface LibraryMeterProps {
  pack: PackResult
  budget: number
  contextLimit: number
  budgetPct: number
  libraryMode: LibraryMode
  dayWindowDays: number | null
  counts: LibraryCounts
  limitAssumed: boolean
  onModeChange: (m: LibraryMode) => void
  onBudgetPctChange: (p: number) => void
  onDayWindowChange: (d: number | null) => void
}

const BUDGET_OPTIONS = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
] as const

const DAY_OPTIONS: { label: string; value: number | null }[] = [
  { label: '1', value: 1 },
  { label: '3', value: 3 },
  { label: '7', value: 7 },
  { label: '14', value: 14 },
  { label: '30', value: 30 },
  { label: 'All', value: null },
]

function selectClass() {
  return 'bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-1.5 py-0.5 text-[11px] text-[var(--color-text-secondary)] outline-none'
}

export function LibraryMeter({
  pack,
  budget,
  contextLimit,
  budgetPct,
  libraryMode,
  dayWindowDays,
  counts,
  limitAssumed,
  onModeChange,
  onBudgetPctChange,
  onDayWindowChange,
}: LibraryMeterProps) {
  const headroom = Math.max(0, budget - pack.estimatedTokens)
  const pctLabel = Math.round(budgetPct * 100)

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
        <div className="flex rounded-md overflow-hidden border border-[var(--color-border-faint)]">
          {(['auto', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onModeChange(mode)}
              className={`px-2 py-0.5 text-[10px] capitalize transition-colors ${
                libraryMode === mode
                  ? 'bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {mode === 'auto' ? 'Auto' : 'Custom'}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1">
          Budget
          <select
            value={budgetPct}
            onChange={(e) => onBudgetPctChange(Number(e.target.value))}
            className={selectClass()}
          >
            {BUDGET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1">
          Days
          <select
            value={dayWindowDays === null ? 'all' : String(dayWindowDays)}
            onChange={(e) => {
              const v = e.target.value
              onDayWindowChange(v === 'all' ? null : Number(v))
            }}
            className={selectClass()}
          >
            {DAY_OPTIONS.map((o) => (
              <option key={o.label} value={o.value === null ? 'all' : String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums min-w-0">
        <div className="min-w-0">
          <div className="text-[10px] text-[var(--color-text-quaternary)] uppercase tracking-[0.04em]">Hot</div>
          <div className="text-[var(--color-text-secondary)] truncate">~{formatTokens(pack.estimatedTokens)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-[var(--color-text-quaternary)] uppercase tracking-[0.04em]">Budget</div>
          <div className="text-[var(--color-text-secondary)] truncate" title={`${pctLabel}% of ${formatTokens(contextLimit)}${limitAssumed ? ' (assumed)' : ''}`}>
            {formatTokens(budget)}
            <span className="text-[var(--color-text-quaternary)]">
              {' '}
              ({pctLabel}% of {formatTokens(contextLimit)}
              {limitAssumed ? '†' : ''})
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-[var(--color-text-quaternary)] uppercase tracking-[0.04em]">Headroom</div>
          <div className="text-[var(--color-text-secondary)] truncate">{formatTokens(headroom)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-[var(--color-text-quaternary)] uppercase tracking-[0.04em]">Corpus</div>
          <div className="text-[var(--color-text-secondary)] truncate">
            {counts.posts} posts · {counts.reports} reports
          </div>
        </div>
      </div>

      {libraryMode === 'custom' && pack.overBudget && (
        <div className="text-[11px] text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-md px-2 py-1">
          Hot ~{formatTokens(pack.estimatedTokens)} exceeds budget {formatTokens(budget)} — raise budget,
          shorten window, switch to Auto, or narrow context
        </div>
      )}

      <div className="text-[10px] text-[var(--color-text-quaternary)]">X · News soon · Signal soon · Stats soon</div>
    </div>
  )
}
