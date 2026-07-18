import { useEffect, useRef, useState } from 'react'
import { downloadThread, type ThreadExportFormat } from '../../lib/compose/thread-meta'
import { useComposeStore } from '../../stores/compose-store'

type ThreadExportButtonProps = {
  threadId: string
  /**
   * `icon` — compact download glyph (history rail).
   * `label` — text button matching Templates/Draft footer chrome.
   */
  variant?: 'icon' | 'label'
  /** Disable while streaming / blocked. */
  disabled?: boolean
}

/** Download control for a compose thread — Markdown (chat + draft) or full-fidelity JSON. */
export function ThreadExportButton({
  threadId,
  variant = 'icon',
  disabled = false,
}: ThreadExportButtonProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const exportAs = (format: ThreadExportFormat) => {
    const thread = useComposeStore.getState().threads[threadId]
    if (!thread) return
    downloadThread(thread, format)
    setOpen(false)
  }

  const isLabel = variant === 'label'

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (disabled) return
          setOpen((o) => !o)
        }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Export full chat and draft"
        aria-label="Export chat and draft"
        className={
          isLabel
            ? 'px-3 py-1.5 text-[11px] font-medium border border-[var(--color-border-faint)] text-[var(--color-text-secondary)] rounded-md hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed'
            : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-0.5 rounded disabled:opacity-30'
        }
      >
        {isLabel ? (
          'Export'
        ) : (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={
            isLabel
              ? 'absolute left-0 bottom-full mb-1 z-20 min-w-[12rem] rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-overlay)] py-1 shadow-lg'
              : 'absolute right-0 top-full mt-0.5 z-20 min-w-[7.5rem] rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-overlay)] py-1 shadow-lg'
          }
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => exportAs('md')}
            className="block w-full px-3 py-1.5 text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-border-faint)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <div className="text-[11px]">Markdown</div>
            {isLabel && (
              <div className="text-[10px] text-[var(--color-text-quaternary)] mt-0.5 leading-snug">
                Chat + draft, readable
              </div>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => exportAs('json')}
            className="block w-full px-3 py-1.5 text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-border-faint)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <div className="text-[11px]">JSON</div>
            {isLabel && (
              <div className="text-[10px] text-[var(--color-text-quaternary)] mt-0.5 leading-snug">
                Full thread backup
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
