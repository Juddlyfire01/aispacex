import { useState } from 'react'
import { cn } from '../../lib/utils'

/** Shared chrome for Self / Others rail top actions — one source of truth for box + label text. */
const RAIL_TOP_SHELL =
  'w-full min-h-9 flex items-center bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] font-normal leading-none text-[var(--color-text-primary)] transition-colors'

const RAIL_TOP_INPUT =
  'relative z-[1] w-full bg-transparent border-0 outline-none p-0 m-0 text-left text-[inherit] font-[inherit] leading-[inherit] caret-[var(--color-text-primary)]'

type RailTopConnectButtonProps = {
  onClick: () => void
}

export function RailTopConnectButton({ onClick }: RailTopConnectButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(RAIL_TOP_SHELL, 'justify-center text-center hover:border-[var(--color-border-strong)]')}
    >
      +Connect Account
    </button>
  )
}

type RailTopAddProfileInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

export function RailTopAddProfileInput({ value, onChange, onSubmit }: RailTopAddProfileInputProps) {
  const [focused, setFocused] = useState(false)
  const showPlaceholder = value.length === 0 && !focused

  return (
    <div className={cn(RAIL_TOP_SHELL, 'justify-start focus-within:border-[var(--color-border-strong)] cursor-text relative')}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Add profile"
        className={cn(RAIL_TOP_INPUT, showPlaceholder ? 'text-transparent' : 'text-[var(--color-text-primary)]')}
      />
      {showPlaceholder && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-start px-2 text-[inherit] font-[inherit] leading-[inherit] text-[var(--color-text-primary)]">
          +Add Profile
        </span>
      )}
    </div>
  )
}
