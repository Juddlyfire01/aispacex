import { useToastStore, type Toast } from '../../stores/toast-store'
import { cn } from '../../lib/utils'

const VARIANT_STYLES: Record<Toast['variant'], string> = {
  info: 'border-[var(--color-border-soft)] bg-[var(--color-bg-raised)]',
  // Success stays on-theme; only the title is tinted green (see VARIANT_TITLE).
  success: 'border-[var(--color-border-soft)] bg-[var(--color-bg-raised)]',
  error: 'border-red-500/30 bg-red-500/[0.06]',
  progress: 'border-[var(--color-border-soft)] bg-[var(--color-bg-raised)]',
}

const VARIANT_TITLE: Record<Toast['variant'], string> = {
  info: 'text-[var(--color-text-primary)]',
  success: 'text-green-400/90',
  error: 'text-red-200/85',
  progress: 'text-[var(--color-text-primary)]',
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--color-border-soft)]/60"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const isJobToast = typeof t.progress === 'number' || t.variant === 'progress'
        const labelText =
          t.progressLabel ??
          (t.variant === 'success' ? 'Complete' : t.variant === 'error' ? 'Failed' : null)
        return (
          <div
            key={t.id}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto box-border w-80 rounded-lg border px-3.5 py-2.5 shadow-xl shadow-black/60 backdrop-blur-md animate-scale-in',
              // Job toasts keep a stable footprint from progress → ready/fail.
              isJobToast && 'min-h-[6.75rem]',
              VARIANT_STYLES[t.variant],
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className={cn('text-[13.5px] font-medium truncate', VARIANT_TITLE[t.variant])}>{t.title}</div>
                {(t.description || isJobToast) && (
                  <div className={cn(
                    'text-[12.5px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed break-words',
                    isJobToast && 'min-h-[1.25rem]',
                  )}>
                    {t.description ?? '\u00a0'}
                  </div>
                )}
                {isJobToast && typeof t.progress === 'number' && <ProgressBar value={t.progress} />}
                {isJobToast && (
                  <div className="text-[11.5px] text-[var(--color-text-tertiary)] mt-1.5 h-[1.125rem] tabular-nums truncate">
                    {labelText ?? '\u00a0'}
                  </div>
                )}
                {t.action && (
                  <button
                    onClick={() => {
                      t.action?.onClick()
                      dismiss(t.id)
                    }}
                    className="mt-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors p-0.5 -m-0.5 shrink-0 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]"
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
