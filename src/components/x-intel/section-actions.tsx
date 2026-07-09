import { cn } from '../../lib/utils'

/** Relative-time formatter for "last refreshed" labels. */
function relativeTime(iso: string | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg
    width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round"
    className={cn(spinning && 'animate-spin')}
  >
    <path d="M21 12a9 9 0 11-2.6-6.4" /><polyline points="21 3 21 9 15 9" />
  </svg>
)

/**
 * Compact "Refresh" control for a populated Intel section header. Shows when the
 * section was last gathered and surfaces inline errors. Single source of truth so
 * Profile / Feed / Network refresh affordances stay identical.
 */
/** Compact bordered action button — shared by section refresh controls and profile disconnect. */
export const sectionActionBtnCls =
  'flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md border border-white/[0.08] text-white/55 hover:text-white/85 hover:border-white/[0.2] transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 shrink-0'

const refreshBtnCls = sectionActionBtnCls

export function SectionRefresh({ onClick, busy, disabled, lastGatheredIso, error, label = 'Refresh', layout = 'compact' }: {
  onClick: () => void
  busy?: boolean
  disabled?: boolean
  lastGatheredIso?: string
  error?: string | null
  label?: string
  /** `compact` = stacked, right-aligned (feed/network). `bar` = full-width row (profile card). */
  layout?: 'compact' | 'bar'
}) {
  const btn = (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      title={disabled ? 'Connect X first' : `Last refreshed ${relativeTime(lastGatheredIso)}`}
      className={refreshBtnCls}
    >
      <RefreshIcon spinning={busy} />
      {busy ? 'Refreshing…' : label}
    </button>
  )

  if (layout === 'bar') {
    return (
      <div className="flex items-center justify-between gap-3 w-full">
        {error
          ? <span className="text-[10px] text-red-400/70 min-w-0">{error}</span>
          : <span className="text-[10px] text-white/25 font-mono truncate">Updated {relativeTime(lastGatheredIso)}</span>}
        {btn}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0">
      {btn}
      {error
        ? <span className="text-[9px] text-red-400/70">{error}</span>
        : <span className="text-[9px] text-white/20 font-mono">updated {relativeTime(lastGatheredIso)}</span>}
    </div>
  )
}

/**
 * Actionable empty-state for an Intel section — replaces dead-end "re-gather from
 * the target rail" text with a button that fetches the missing data in place.
 */
export function SectionEmpty({ title, hint, actionLabel, onAction, busy, disabled, error, secondaryLabel, onSecondary, secondaryBusy }: {
  title: string
  hint?: string
  actionLabel: string
  onAction: () => void
  busy?: boolean
  disabled?: boolean
  error?: string | null
  secondaryLabel?: string
  onSecondary?: () => void
  secondaryBusy?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
      <div className="space-y-1">
        <p className="text-[13px] text-white/45 font-medium">{title}</p>
        {hint && <p className="text-[11px] text-white/25 max-w-xs">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onAction}
          disabled={busy || disabled}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
        >
          <RefreshIcon spinning={busy} />
          {busy ? 'Gathering…' : actionLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button
            onClick={onSecondary}
            disabled={secondaryBusy || disabled}
            className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-white/[0.1] text-white/70 hover:text-white hover:border-white/[0.2] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {secondaryBusy ? 'Gathering…' : secondaryLabel}
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-red-400/70">{error}</p>}
    </div>
  )
}
