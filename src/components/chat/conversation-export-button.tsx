import { useEffect, useRef, useState } from 'react'
import {
  downloadConversation,
  type ConversationExportFormat,
} from '../../lib/chat/export-conversation'
import type { Conversation } from '../../types/venice'

type ConversationExportButtonProps = {
  conversation: Conversation
  /** Compact icon style for sidebar history rows. */
  compact?: boolean
}

/** Markdown / JSON export control — matches compose + intel report patterns. */
export function ConversationExportButton({
  conversation,
  compact = true,
}: ConversationExportButtonProps) {
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

  const exportAs = (format: ConversationExportFormat) => {
    downloadConversation(conversation, format)
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
        aria-label={`Export ${conversation.title || 'conversation'}`}
        className={
          compact
            ? 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]'
            : 'px-2.5 py-1 text-[11px] font-medium border border-[var(--color-border-soft)] text-[var(--color-text-secondary)] rounded-md hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] transition-colors'
        }
      >
        {compact ? (
          <svg
            width="11"
            height="11"
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
        ) : (
          'Export'
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-0.5 z-20 min-w-[7.5rem] rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-overlay)] py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => exportAs('md')}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-faint)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Markdown
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => exportAs('json')}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-faint)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            JSON
          </button>
        </div>
      )}
    </div>
  )
}
