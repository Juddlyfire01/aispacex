import { cn } from '../../lib/utils'

/**
 * Shared on/off switch used across Settings and Connections. Matches the
 * generation-suite pattern (image Safe mode / music toggles): position the
 * thumb with `left`, contrast colors so on-state never blends into a white track.
 */
export function ToggleSwitch({
  checked,
  onChange,
  'aria-label': ariaLabel,
  disabled,
  className,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  'aria-label': string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-[var(--color-btn-primary-bg)]' : 'bg-[var(--color-border-faint)]',
        className,
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all',
          checked
            ? 'left-[16px] bg-[var(--color-btn-primary-fg)]'
            : 'left-[2px] bg-[var(--color-text-quaternary)]',
        )}
      />
    </button>
  )
}
