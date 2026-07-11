import { useEffect, useMemo, useRef, useState } from 'react'
import { useComposeStore, ME_CONTEXT, ALL_CONTEXT } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import {
  contextBadgeLabel,
  formatRelativeTime,
  formatTokenCount,
  groupThreadsByDay,
  messageContentString,
} from '../../lib/compose/thread-meta'
import type { ComposeThread } from '../../lib/compose/thread-types'
import type { ComposeScope } from '../../lib/intel-library/types'
import { CostMeter } from '../x-intel/cost-meter'
import { ThreadExportButton } from './thread-export-button'
import { Checkbox } from '../ui/checkbox'
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
            'shrink-0 text-[var(--color-text-primary)] transition-transform duration-150',
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
  const deleteThreads = useComposeStore((s) => s.deleteThreads)
  const [filter, setFilter] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const rows = useMemo(() => {
    return threadOrder
      .map((id) => threads[id])
      .filter((t): t is ComposeThread => Boolean(t))
      .filter((t) => threadMatchesQuery(t, filter))
  }, [threadOrder, threads, filter])

  const dayGroups = useMemo(() => groupThreadsByDay(rows), [rows])

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDelete = (thread: ComposeThread) => {
    if (thread.messages.length > 0) {
      if (!confirm('Delete this chat? Messages and draft will be removed.')) return
    }
    deleteThread(thread.id)
  }

  const handleBulkDelete = () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const anyWithMessages = ids.some((id) => (threads[id]?.messages.length ?? 0) > 0)
    if (anyWithMessages) {
      const n = ids.length
      if (
        !confirm(
          n === 1
            ? 'Delete this chat? Messages and draft will be removed.'
            : `Delete ${n} chats? Messages and drafts will be removed.`,
        )
      ) {
        return
      }
    }
    deleteThreads(ids)
    exitSelectMode()
  }

  return (
    <div className="w-52 shrink-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)] flex flex-col">
      <div className="p-2">
        <NewChatMenu />
      </div>

      <div className="px-2 pb-2 flex items-center gap-1.5">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search chats…"
          aria-label="Search chats"
          className="min-w-0 flex-1 min-h-9 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] leading-none text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-placeholder)]"
        />
        <button
          type="button"
          onClick={() => {
            if (selectMode) exitSelectMode()
            else setSelectMode(true)
          }}
          aria-pressed={selectMode}
          className={cn(
            'shrink-0 min-h-9 px-2 py-1.5 rounded-md text-[11px] leading-none font-normal bg-[var(--color-bg-input)] border transition-colors',
            selectMode
              ? 'border-[var(--color-border-strong)] text-[var(--color-text-primary)]'
              : 'border-[var(--color-border-faint)] text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]',
          )}
        >
          {selectMode ? 'Done' : 'Select'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {rows.length === 0 ? (
          <div className="px-2 py-5 text-[11px] text-[var(--color-text-tertiary)] text-center">
            {filter.trim()
              ? 'No chats match your search'
              : 'No chats yet — choose a context above'}
          </div>
        ) : (
          dayGroups.map((group) => (
            <div key={group.dayKey}>
              <div className="px-2 pt-2 pb-1 text-[9px] font-medium tracking-wide uppercase text-[var(--color-text-tertiary)]">
                {group.label}
              </div>
              {group.threads.map((thread) => {
                const active = !selectMode && thread.id === activeThreadId
                const selected = selectedIds.has(thread.id)
                return (
                  <div
                    key={thread.id}
                    role="button"
                    tabIndex={0}
                    title={threadPillTip()}
                    aria-label={`${contextBadgeLabel(thread.context)}: ${thread.preview}`}
                    aria-pressed={selectMode ? selected : undefined}
                    onClick={() => {
                      if (selectMode) toggleSelected(thread.id)
                      else selectThread(thread.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (selectMode) toggleSelected(thread.id)
                        else selectThread(thread.id)
                      }
                    }}
                    className={cn(
                      'group relative flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[11px] cursor-pointer transition-colors',
                      selected
                        ? 'text-[var(--color-text-primary)] bg-[var(--color-border-faint)]'
                        : active
                          ? 'text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)]',
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-[var(--color-accent)]" />
                    )}
                    {selectMode ? (
                      <span
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selected}
                          onChange={() => toggleSelected(thread.id)}
                          size="sm"
                          aria-label={`Select ${thread.preview || 'chat'}`}
                        />
                      </span>
                    ) : null}
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
                    {!selectMode ? (
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
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {selectMode && selectedIds.size > 0 ? (
        <div className="px-2 py-2 border-t border-[var(--color-border-faint)] flex items-center justify-between gap-2">
          <span className="text-[10px] text-[var(--color-text-tertiary)]">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="text-[10px] px-2 py-1 rounded-md border border-[var(--color-border-faint)] text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-border-faint)] transition-colors"
          >
            Delete
          </button>
        </div>
      ) : null}

      <CostMeter defaultView="venice" />
    </div>
  )
}
