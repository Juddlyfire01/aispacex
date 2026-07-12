import { useEffect, useRef, useState } from 'react'
import { downloadThread, type ThreadExportFormat } from '../../lib/compose/thread-meta'
import { useComposeStore } from '../../stores/compose-store'

type ThreadExportButtonProps = {
  threadId: string
}

/** Compact download control for history pills — Markdown or full-fidelity JSON. */
export function ThreadExportButton({ threadId }: ThreadExportButtonProps) {
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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Export chat"
        aria-label="Export chat"
        className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-0.5 rounded"
      >
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
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-0.5 z-20 min-w-[7.5rem] rounded-md border border-[var(--color-border-faint)] bg-[var(--color-bg-raised)] py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => exportAs('md')}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Markdown
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => exportAs('json')}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--color-text-primary)] transition-colors"
          >
            JSON
          </button>
        </div>
      )}
    </div>
  )
}
