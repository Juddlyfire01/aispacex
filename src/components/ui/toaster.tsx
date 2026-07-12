import { useToastStore, type Toast } from '../../stores/toast-store'
import { cn } from '../../lib/utils'

/** Shared shell — every toast, every variant. Status color lives only on row 1. */
const TOAST_SHELL =
  'pointer-events-auto box-border flex h-[6.75rem] w-80 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-bg-card)] px-3.5 py-2.5 shadow-[var(--color-surface-shadow)] animate-scale-in'

const TITLE_COLOR: Record<Toast['variant'], string> = {
  info: 'text-[var(--color-accent)]',
  progress: 'text-[var(--color-accent)]',
  success: 'text-green-400/90',
  // True error red (not pastel red-200, which reads pink on dark).
  // Aligns with app-wide error text (red-400) and is close to X #F4212E / Cursor #f14c4c.
  error: 'text-red-400/90',
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      className="relative h-1 w-full overflow-hidden rounded-full bg-[var(--color-border-soft)]/60"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      {/* Soft shimmer on the unfilled track only */}
      <div
        className="progress-track-shimmer pointer-events-none absolute inset-0 rounded-full"
        aria-hidden
      />
      <div
        className="relative h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/**
 * Global toast host. Every toast is a fixed 4-row card:
 * 1 title (status-colored) · 2 context · 3 progress bar or blank · 4 aux or blank.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const hasProgress = typeof t.progress === 'number'
        const auxText =
          t.progressLabel ??
          (t.variant === 'success' && hasProgress
            ? 'Complete'
            : t.variant === 'error' && hasProgress
              ? 'Failed'
              : null)
        return (
          <div
            key={t.id}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className={TOAST_SHELL}
          >
            <div className="flex h-full w-full items-start gap-3">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {/* Row 1 — status title */}
                <div className={cn('truncate text-[13.5px] font-medium', TITLE_COLOR[t.variant])}>
                  {t.title}
                </div>
                {/* Row 2 — context */}
                <div className="mt-0.5 min-h-[1.25rem] truncate text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
                  {t.description ?? '\u00a0'}
                </div>
                {/* Row 3 — progress bar or blank reserved */}
                <div className="mt-2 h-1 w-full shrink-0">
                  {hasProgress ? <ProgressBar value={t.progress!} /> : null}
                </div>
                {/* Row 4 — aux / action or blank reserved */}
                <div className="mt-1.5 flex h-[1.125rem] items-center">
                  {t.action ? (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick()
                        dismiss(t.id)
                      }}
                      className="truncate text-[12.5px] font-medium text-[var(--color-text-secondary)] underline underline-offset-2 hover:text-[var(--color-text-primary)]"
                    >
                      {t.action.label}
                    </button>
                  ) : (
                    <div className="h-full truncate text-[11.5px] tabular-nums text-[var(--color-text-tertiary)]">
                      {auxText ?? '\u00a0'}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-m-0.5 shrink-0 rounded p-0.5 text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
