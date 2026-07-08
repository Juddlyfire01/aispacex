import { cn } from '../../lib/utils'

/** X OAuth entry point — theme-aware primary pill. */
export function SignInWithXButton({
  onClick,
  className,
  disabled,
}: {
  onClick: () => void
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Connect to X"
      className={cn(
        'inline-flex items-center justify-center min-w-[220px] px-5 py-2.5',
        'text-[13px] font-bold tracking-[0.01em] rounded-full',
        'bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)]',
        'hover:opacity-90 transition-opacity',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      Connect
    </button>
  )
}
