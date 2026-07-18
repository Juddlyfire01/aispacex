import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** Centered dialog shell — raised surface on theme canvas, not overlay blue. */
export function Modal({
  open,
  onClose,
  children,
  className,
  'aria-labelledby': labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  'aria-labelledby'?: string
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-[var(--color-bg-modal)] border border-[var(--color-border-soft)] rounded-xl p-6 w-full max-w-sm mx-4 animate-scale-in shadow-[var(--color-surface-shadow)]',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export const modalInputClass =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-soft)] rounded-lg px-3.5 py-2.5 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] transition-colors placeholder:text-[var(--color-text-placeholder)]'

export const modalGhostBtnClass =
  'px-3 py-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors'

/** Compact outline secondary — Refresh / Look up / Add target style chrome. */
export const modalSecondaryBtnClass =
  'rounded-md border border-[var(--color-border-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-border-faint)] transition-colors disabled:opacity-40 disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2'

export const modalPrimaryBtnClass =
  'px-4 py-1.5 font-medium bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] rounded-md hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2'
