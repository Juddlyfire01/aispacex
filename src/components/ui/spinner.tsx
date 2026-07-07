import { cn } from '../../lib/utils'

const SPINNER_SIZES = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
} as const

export type SpinnerSize = keyof typeof SPINNER_SIZES

export function Spinner({ className, size = 'sm' }: { className?: string; size?: SpinnerSize }) {
  return (
    <svg
      className={cn('animate-spin text-[var(--color-accent)]', SPINNER_SIZES[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function LoadingState({
  label,
  size = 'sm',
  className,
  labelClassName,
}: {
  label?: string
  size?: SpinnerSize
  className?: string
  labelClassName?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2', className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Spinner size={size} />
      {label ? (
        <span className={cn('text-[13px] text-[var(--color-text-secondary)]', labelClassName)}>{label}</span>
      ) : null}
    </div>
  )
}

/** Full-view Suspense fallback — spinner + short label. */
export function ViewLoadingFallback({ label }: { label: string }) {
  return (
    <LoadingState
      className="h-full"
      label={label}
      size="md"
      labelClassName="text-[12px] text-[var(--color-text-tertiary)]"
    />
  )
}
