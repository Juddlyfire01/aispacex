import { useEffect, useMemo, useRef, useState } from 'react'
import { useComposeStore, ME_CONTEXT, ALL_CONTEXT } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import {
  contextBadgeLabel,
  formatRelativeTime,
  formatTokenCount,
  messageContentString,
} from '../../lib/compose/thread-meta'
import type { ComposeThread } from '../../lib/compose/thread-types'
import type { ComposeScope } from '../../lib/intel-library/types'
import { CostMeter } from '../x-intel/cost-meter'
import { ThreadExportButton } from './thread-export-button'
import { cn } from '../../lib/utils'

function threadMatchesQuery(thread: ComposeThread, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (thread.title.toLowerCase().includes(q)) return true
  if (thread.preview.toLowerCase().includes(q)) return true
  return thread.messages.some((m) => messageContentString(m).toLowerCase().includes(q))
}

/**
 * Hover explains what the pill does not already show
 * (badge, preview, time, and ~token size are on the row).
 */
function threadPillTip(): string {
  return 'Encrypted on this device. Size is messages + draft. Agent can search older chats.'
}

/** Pick context and create — no silent default from a separate settings control. */
function NewChatMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const createThread = useComposeStore((s) => s.createThread)
  const setNewThreadContext = useComposeStore((s) => s.setNewThreadContext)
  const targets = useXIntelStore((s) => s.targets)
  const activeTarget = useXIntelStore((s) => s.activeTarget)
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const accountOrder = useXSelfStore((s) => s.accountOrder)
  const accounts = useXSelfStore((s) => s.accounts)
  const selfAccountId = activeAccountId ?? accountOrder[0] ?? null
  const selfUsername = selfAccountId ? accounts[selfAccountId]?.username : null
  const selfLabel = selfUsername ? `@${selfUsername.replace(/^@/, '')}` : '@me'

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const options: { key: string; label: string; scope: ComposeScope }[] = [
    { key: ALL_CONTEXT, label: 'All', scope: { type: 'all' } },
    { key: ME_CONTEXT, label: selfLabel, scope: { type: 'me' } },
    ...targets.map((t) => ({
      key: t,
      label: `@${t}`,
      scope: { type: 'target' as const, username: t },
    })),
  ]

  const pick = (scope: ComposeScope) => {
    setNewThreadContext(scope)
    createThread(scope)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="New chat — choose context"
        className={cn(
          'w-full min-h-9 flex items-center justify-center gap-1.5 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] font-normal leading-none text-center text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)]',
          open && 'border-[var(--color-border-strong)]',
        )}
      >
        + New chat
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={cn(
            'shrink-0 text-[var(--color-text-tertiary)] transition-transform duration-150',
            open && 'rotate-180',
          )}
          aria-hidden
        >
          <path d="M2.5 3.75L5 6.25L7.5 3.75" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Chat context"
          className="absolute z-50 left-0 right-0 mt-0.5 bg-[var(--color-bg-raised)] border border-[var(--color-border-soft)] rounded-md shadow-2xl shadow-black/50 overflow-hidden"
        >
          <div className="max-h-60 overflow-y-auto p-0.5">
            {options.map((o) => {
              const isActiveTarget =
                o.scope.type === 'target' && o.scope.username === activeTarget
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  onClick={() => pick(o.scope)}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 text-[11px] rounded transition-colors',
                    isActiveTarget
                      ? 'text-[var(--color-text-primary)] bg-[var(--color-bg-overlay)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border-faint)] hover:text-[var(--color-text-primary)]',
                  )}
                >
                  {o.label}
                  {isActiveTarget ? (
                    <span className="ml-1 text-[9px] text-[var(--color-text-tertiary)]">active</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function HistoryRail() {
  const threadOrder = useComposeStore((s) => s.threadOrder)
  const threads = useComposeStore((s) => s.threads)
  const activeThreadId = useComposeStore((s) => s.activeThreadId)
  const selectThread = useComposeStore((s) => s.selectThread)
  const deleteThread = useComposeStore((s) => s.deleteThread)
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    return threadOrder
      .map((id) => threads[id])
      .filter((t): t is ComposeThread => Boolean(t))
      .filter((t) => threadMatchesQuery(t, filter))
  }, [threadOrder, threads, filter])

  const handleDelete = (thread: ComposeThread) => {
    if (thread.messages.length > 0) {
      if (!confirm('Delete this chat? Messages and draft will be removed.')) return
    }
    deleteThread(thread.id)
  }

  return (
    <div className="w-52 shrink-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)] flex flex-col">
      <div className="p-2">
        <NewChatMenu />
      </div>

      <div className="px-2 pb-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search chats…"
          aria-label="Search chats"
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-placeholder)]"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {rows.length === 0 ? (
          <div className="px-2 py-5 text-[11px] text-[var(--color-text-tertiary)] text-center">
            {filter.trim()
              ? 'No chats match your search'
              : 'No chats yet — choose a context above'}
          </div>
        ) : (
          rows.map((thread) => {
            const active = thread.id === activeThreadId
            return (
              <div
                key={thread.id}
                role="button"
                tabIndex={0}
                title={threadPillTip()}
                aria-label={`${contextBadgeLabel(thread.context)}: ${thread.preview}`}
                onClick={() => selectThread(thread.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectThread(thread.id)
                  }
                }}
                className={cn(
                  'group relative flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[11px] cursor-pointer transition-colors',
                  active
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)]',
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-[var(--color-accent)]" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="shrink-0 text-[9px] text-[var(--color-text-tertiary)]">
                      {contextBadgeLabel(thread.context)}
                    </span>
                    <span className="truncate">{thread.preview}</span>
                  </div>
                  <div className="text-[9px] text-[var(--color-text-tertiary)]">
                    {formatRelativeTime(thread.updatedAt)} · {formatTokenCount(thread.tokenEstimate)}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
                  <ThreadExportButton thread={thread} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(thread)
                    }}
                    title="Delete chat"
                    aria-label="Delete chat"
                    className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-0.5 rounded"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <CostMeter defaultView="venice" />
    </div>
  )
}
