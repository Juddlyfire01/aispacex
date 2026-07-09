/** Primary CTA for Self rail top action — same fill tokens as PrimaryButton. */
const RAIL_TOP_BUTTON =
  'w-full min-h-9 flex items-center justify-center rounded-md px-2 py-1.5 text-[11px] font-medium leading-none text-center bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2'

/** Standard compact rail text input — matches compose history search / global inputs. */
const RAIL_TOP_TEXT_INPUT =
  'w-full min-h-9 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors placeholder:text-[var(--color-text-placeholder)]'

type RailTopConnectButtonProps = {
  onClick: () => void
}

export function RailTopConnectButton({ onClick }: RailTopConnectButtonProps) {
  return (
    <button type="button" onClick={onClick} className={RAIL_TOP_BUTTON}>
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
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit()
      }}
      placeholder="+Add Profile (@username)"
      aria-label="Add profile"
      autoComplete="off"
      spellCheck={false}
      className={RAIL_TOP_TEXT_INPUT}
    />
  )
}
