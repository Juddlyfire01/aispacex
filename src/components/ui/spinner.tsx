import { cn } from '../../lib/utils'

const SPINNER_SIZES = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
} as const

export type SpinnerSize = keyof typeof SPINNER_SIZES

/** Shared copy for Suspense + in-view data gates so the label never changes mid-load. */
export const VIEW_LOADING_LABEL = {
  image: 'Loading image…',
  audio: 'Loading audio…',
  music: 'Loading music…',
  video: 'Loading video…',
  intel: 'Loading intel…',
  compose: 'Loading compose…',
  stats: 'Loading stats…',
  signal: 'Loading signal…',
  news: 'Loading news…',
  settings: 'Loading settings…',
} as const

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
      aria-busy="true"
      aria-label={label}
    >
      <Spinner size={size} />
      {label ? (
        <span
          className={cn(
            'text-[13px] text-[var(--color-text-secondary)] shrink-0',
            labelClassName,
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Full-main loading shell — same absolute center on every top-level page.
 * Use for Suspense fallbacks and in-view data gates so spinner + label never jump.
 */
export function ViewLoadingFallback({ label }: { label: string }) {
  return (
    <div
      className="flex flex-1 min-h-0 h-full w-full flex-col items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      {/* Fixed stack geometry: md spinner + 12px label + gap-2 — identical on every page */}
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span className="text-[12px] leading-5 text-[var(--color-text-secondary)] text-center min-h-5">
          {label}
        </span>
      </div>
    </div>
  )
}
