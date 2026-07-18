import { cn } from '../../lib/utils'
import { Spinner } from './spinner'
import { Surface } from './surface'

export function Label({
  children,
  htmlFor,
  hint,
  title,
}: {
  children: React.ReactNode
  htmlFor?: string
  hint?: string
  /** Native tooltip on the label text (e.g. help copy without eating row space). */
  title?: string
}) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label
        htmlFor={htmlFor}
        title={title}
        className="block text-[11.5px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em]"
      >
        {children}
      </label>
      {hint && <span className="text-[11px] text-[var(--color-text-tertiary)]">{hint}</span>}
    </div>
  )
}

export function TextArea({ value, onChange, placeholder, rows = 3, ariaLabel, maxLength, autoFocus }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  ariaLabel?: string
  maxLength?: number
  autoFocus?: boolean
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      aria-label={ariaLabel ?? placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-soft)] rounded-lg px-3 py-2.5 text-[15px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors resize-none placeholder:text-[var(--color-text-placeholder)] leading-relaxed"
    />
  )
}

/**
 * Theme primary fill colors. Use for compact CTAs that aren't full-width
 * PrimaryButton — same tokens on every theme (accent on Venice/grey/light,
 * white-on-black on X dark).
 */
export const primaryBtnFillClass =
  'bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90'

export function PrimaryButton({ onClick, disabled, loading, children, ariaLabel, size = 'md' }: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  children: React.ReactNode
  ariaLabel?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizing = size === 'sm' ? 'py-1.5 text-[13px]' : size === 'lg' ? 'py-2.5 text-[15px]' : 'py-2 text-[14px]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={cn(
        'w-full rounded-lg font-medium transition-all duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
        sizing,
        !disabled && !loading
          ? cn(primaryBtnFillClass, 'active:scale-[0.99] shadow-sm')
          : 'bg-[var(--color-border-faint)] text-[var(--color-text-tertiary)] cursor-not-allowed',
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2"><Spinner size="sm" className="text-[var(--color-btn-primary-fg)]/45" /> Working…</span>
      ) : children}
    </button>
  )
}

/** Outline secondary control — theme tokens on every appearance (not pure white opacity). */
export const ghostBtnOutlineClass =
  'border border-[var(--color-border-soft)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-border-faint)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2'

export function GhostButton({ onClick, children, disabled, ariaLabel }: { onClick: () => void; children: React.ReactNode; disabled?: boolean; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn('px-3 py-1.5 text-[13px] font-medium rounded-lg', ghostBtnOutlineClass)}
    >
      {children}
    </button>
  )
}

export function PillGroup({ options, value, onChange, ariaLabel, disabled }: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn('flex flex-wrap gap-1', disabled && 'opacity-40')}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'text-[13px] font-medium px-2.5 py-1 rounded-md border transition-all duration-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]',
            'disabled:cursor-not-allowed disabled:hover:text-[var(--color-text-secondary)] disabled:hover:border-[var(--color-border-soft)]',
            o.value === value
              ? 'border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]'
              : 'border-[var(--color-border-soft)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 text-[13px] text-red-300/95 bg-red-500/[0.06] border border-red-500/20 rounded-lg px-3 py-2">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-px">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="leading-relaxed">{children}</span>
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center flex-1 text-[var(--color-text-tertiary)] text-[14px]">{children}</div>
}

export function ExamplePrompts({ items, onPick, title = 'Try one of these' }: {
  items: string[]
  onPick: (text: string) => void
  title?: string
}) {
  return (
    <div className="w-full max-w-md flex flex-col gap-2.5">
      <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] font-semibold">{title}</div>
      <div className="flex flex-col gap-2">
        {items.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="group text-left px-3.5 py-3 rounded-xl border border-[var(--color-border-faint)] bg-[var(--color-bg-base)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-surface)] transition-all text-[13.5px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
          >
            <span className="flex items-start gap-2">
              <span className="text-[var(--color-text-quaternary)] group-hover:text-[var(--color-accent)] transition-colors mt-px">→</span>
              <span className="leading-relaxed">{text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Surface level="card" className={cn('rounded-xl', className)}>
      {children}
    </Surface>
  )
}

export function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] font-semibold">{children}</h3>
      {action}
    </div>
  )
}

const TONE: Record<string, string> = {
  emerald: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/20',
  sky: 'bg-sky-400/15 text-sky-300 border-sky-400/20',
  violet: 'bg-violet-400/15 text-violet-300 border-violet-400/20',
  amber: 'bg-amber-400/15 text-amber-300 border-amber-400/20',
  pink: 'bg-pink-400/15 text-pink-300 border-pink-400/20',
  slate: 'bg-[var(--color-border-faint)] text-[var(--color-text-secondary)] border-[var(--color-border-soft)]',
  rose: 'bg-rose-400/15 text-rose-300 border-rose-400/20',
  teal: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/30',
}

export function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: keyof typeof TONE }) {
  return (
    <span className={cn('inline-flex items-center text-[10px] px-1.5 py-px rounded font-medium uppercase tracking-wider border', TONE[tone] ?? TONE.slate)}>
      {children}
    </span>
  )
}

export function StatusDot({ tone = 'slate', pulsing }: { tone?: 'emerald' | 'amber' | 'rose' | 'slate' | 'teal'; pulsing?: boolean }) {
  const color = tone === 'emerald' ? 'bg-emerald-400'
    : tone === 'amber' ? 'bg-amber-400'
    : tone === 'rose' ? 'bg-rose-400'
    : tone === 'teal' ? 'bg-[var(--color-accent)]'
    : 'bg-[var(--color-text-quaternary)]'
  return (
    <span className={cn('inline-block w-1.5 h-1.5 rounded-full', color, pulsing && 'animate-pulse-dot')} />
  )
}

/**
 * A header status pill (e.g. "Connected" / "Connect API key"). Single source of
 * truth for the connection-indicator styling so every key toggle looks identical.
 * When `connecting` is true, shows a spinner + connectingLabel and disables the
 * click so the user sees the connection process has begun.
 */
export function ConnectionPill({ connected, connecting, connectedLabel, disconnectedLabel, connectingLabel, onClick }: {
  connected: boolean
  connecting?: boolean
  connectedLabel: string
  disconnectedLabel: string
  connectingLabel?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={connecting}
      aria-label={connecting ? (connectingLabel ?? 'Connecting…') : connected ? `${connectedLabel}, manage` : disconnectedLabel}
      aria-busy={connecting || undefined}
      className="flex items-center gap-2 text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--color-border-soft)] hover:border-[var(--color-border-strong)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-80"
    >
      {connecting ? (
        <>
          <Spinner size="sm" className="text-[var(--color-text-secondary)]" />
          <span className="text-[var(--color-text-secondary)] font-medium">
            {connectingLabel ?? 'Connecting…'}
          </span>
        </>
      ) : (
        <>
          <StatusDot tone={connected ? 'teal' : 'slate'} pulsing={!connected} />
          <span className={connected ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}>
            {connected ? connectedLabel : disconnectedLabel}
          </span>
        </>
      )}
    </button>
  )
}
