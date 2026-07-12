import { useEffect, useId, useRef } from 'react'
import { useConfirmStore } from '../../stores/confirm-store'
import { cn } from '../../lib/utils'

/** Shared toast-shell card for centered confirms / prompts. */
export const DIALOG_SHELL =
  'relative box-border flex w-80 flex-col rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-bg-card)] px-3.5 py-2.5 shadow-[var(--color-surface-shadow)] animate-scale-in'

export const dialogCancelBtnClass =
  'text-[12.5px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors'

export const dialogConfirmBtnClass =
  'text-[12.5px] font-medium text-[var(--color-accent)] hover:opacity-80 transition-opacity'

export const dialogDangerBtnClass =
  'text-[12.5px] font-medium text-red-300/90 hover:text-red-200 transition-colors'

/**
 * Global confirm host — toaster-shaped card, centered with dim backdrop.
 */
export function ConfirmDialogHost() {
  const request = useConfirmStore((s) => s.request)
  const settle = useConfirmStore((s) => s.settle)
  const titleId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!request) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        settle(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request, settle])

  if (!request) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/70"
        onClick={() => settle(false)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(DIALOG_SHELL, 'min-h-[6.75rem]')}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id={titleId}
          className={cn(
            'truncate text-[13.5px] font-medium',
            request.danger ? 'text-red-200/85' : 'text-[var(--color-accent)]',
          )}
        >
          {request.title}
        </div>
        <div className="mt-0.5 min-h-[1.25rem] text-[12.5px] leading-relaxed text-[var(--color-text-secondary)] break-words">
          {request.description ?? '\u00a0'}
        </div>
        <div className="mt-2 h-1 w-full shrink-0" aria-hidden />
        <div className="mt-1.5 flex h-[1.125rem] items-center justify-end gap-3">
          <button type="button" className={dialogCancelBtnClass} onClick={() => settle(false)}>
            {request.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={request.danger ? dialogDangerBtnClass : dialogConfirmBtnClass}
            onClick={() => settle(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
