import { type Ref } from 'react'

// Circular context-window usage meter for the compose chat footer (Cursor-style).

interface ContextRingProps {
  /** 0–1 fraction of model context currently estimated for the next send. */
  pct: number
  /** Optional override for the tooltip. */
  title?: string
  /** When set, ring is a button that opens the usage popup. */
  onClick?: () => void
  /** Forwarded for popup positioning / click-outside. */
  buttonRef?: Ref<HTMLButtonElement>
  expanded?: boolean
}

export function ContextRing({ pct, title, onClick, buttonRef, expanded }: ContextRingProps) {
  const clamped = Math.min(Math.max(pct, 0), 1)
  const display = Math.round(clamped * 100)
  const r = 9
  const circumference = 2 * Math.PI * r
  const dash = circumference * clamped

  const critical = display >= 95
  const warn = display >= 85 && !critical
  const stroke = critical ? '#f87171' : warn ? '#fbbf24' : '#6b7280'
  const labelClass = critical
    ? 'text-red-400'
    : warn
      ? 'text-amber-400/80'
      : 'text-white/35'

  const label = title ?? `${display}% of model context — click for breakdown`

  const inner = (
    <>
      <span className={`text-[10px] font-mono tabular-nums ${labelClass}`}>{display}%</span>
      <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90" aria-hidden>
        <circle cx="11" cy="11" r={r} fill="none" stroke="#ffffff14" strokeWidth="2" />
        <circle
          cx="11"
          cy="11"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
    </>
  )

  if (onClick) {
    return (
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 shrink-0 rounded-md px-1 py-0.5 -mr-1 hover:bg-white/[0.04] transition-colors"
      >
        {inner}
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" title={label} aria-label={label}>
      {inner}
    </span>
  )
}
