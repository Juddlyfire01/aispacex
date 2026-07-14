import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
import { StarButton } from '../ui/star-button'
import { confirmDialog } from '../../stores/confirm-store'
import { cn } from '../../lib/utils'

/** Lightweight row data — never hold full message/draft payloads in the rail list. */
export type ThreadRailItem = {
  id: string
  context: ComposeScope
  preview: string
  updatedAt: string
  tokenEstimate: number
  messageCount: number
  starred: boolean
}

function toRailItem(thread: ComposeThread): ThreadRailItem {
  return {
    id: thread.id,
    context: thread.context,
    preview: thread.preview,
    updatedAt: thread.updatedAt,
    tokenEstimate: thread.tokenEstimate,
    messageCount: thread.messages.length,
    starred: Boolean(thread.starred),
  }
}

function railItemMatchesQuery(item: ThreadRailItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item.preview.toLowerCase().includes(q)) return true
  // Deep search only when needed — read from store, don't keep bodies in list state.
  const thread = useComposeStore.getState().threads[item.id]
  if (!thread) return false
  if (thread.title.toLowerCase().includes(q)) return true
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

type HistoryThreadRowProps = {
  item: ThreadRailItem
  selectMode: boolean
  selected: boolean
  active: boolean
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onToggleStar: (id: string) => void
  onDelete: (id: string, messageCount: number) => void
}

const HistoryThreadRow = memo(function HistoryThreadRow({
  item,
  selectMode,
  selected,
  active,
  onToggle,
  onSelect,
  onToggleStar,
  onDelete,
}: HistoryThreadRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      title={threadPillTip()}
      aria-label={`${contextBadgeLabel(item.context)}: ${item.preview}`}
      aria-pressed={selectMode ? selected : undefined}
      onClick={() => {
        if (selectMode) {
          // Starred chats cannot be bulk-deleted — still allow selection for clarity? skip.
          if (item.starred) return
          onToggle(item.id)
        } else onSelect(item.id)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (selectMode) {
            if (item.starred) return
            onToggle(item.id)
          } else onSelect(item.id)
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
          {item.starred ? (
            <span
              title="Unstar to select for delete"
              className="inline-flex w-3.5 h-3.5 items-center justify-center text-amber-300/80"
              aria-label="Starred — cannot bulk delete"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
          ) : (
            <Checkbox
              checked={selected}
              onChange={() => onToggle(item.id)}
              size="sm"
              aria-label={`Select ${item.preview || 'chat'}`}
            />
          )}
        </span>
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {item.starred && !selectMode && (
            <span className="shrink-0 text-amber-300/80" aria-hidden>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
          )}
          <span className="shrink-0 text-[9px] text-[var(--color-text-tertiary)]">
            {contextBadgeLabel(item.context)}
          </span>
          <span className="truncate">{item.preview}</span>
        </div>
        <div className="text-[9px] text-[var(--color-text-tertiary)]">
          {formatRelativeTime(item.updatedAt)} · {formatTokenCount(item.tokenEstimate)}
        </div>
      </div>
      {!selectMode ? (
        <div
          className={cn(
            'flex items-center gap-0.5 transition-opacity shrink-0',
            item.starred
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          <StarButton
            starred={item.starred}
            onToggle={() => onToggleStar(item.id)}
            label={item.preview || 'chat'}
            size={10}
            className="p-0.5"
          />
          <ThreadExportButton threadId={item.id} />
          {item.starred ? null : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(item.id, item.messageCount)
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
          )}
        </div>
      ) : null}
    </div>
  )
})

export function HistoryRail() {
  // Subscribe to lightweight fingerprints only — not full message/draft bodies.
  // useShallow on string[] avoids re-renders when unrelated store fields change.
  const railFingerprints = useComposeStore(
    useShallow((s) =>
      s.threadOrder.map((id) => {
        const t = s.threads[id]
        if (!t) return ''
        const ctx =
          t.context.type === 'target' ? `t:${t.context.username}` : t.context.type
        return `${t.id}\0${t.preview}\0${t.updatedAt}\0${t.tokenEstimate}\0${t.messages.length}\0${ctx}\0${t.starred ? '1' : '0'}`
      }),
    ),
  )

  const railItems = useMemo((): ThreadRailItem[] => {
    const threads = useComposeStore.getState().threads
    return railFingerprints
      .map((fp) => {
        if (!fp) return null
        const id = fp.slice(0, fp.indexOf('\0'))
        const t = threads[id]
        return t ? toRailItem(t) : null
      })
      .filter((t): t is ThreadRailItem => Boolean(t))
  }, [railFingerprints])
  const activeThreadId = useComposeStore((s) => s.activeThreadId)
  const selectThread = useComposeStore((s) => s.selectThread)
  const deleteThread = useComposeStore((s) => s.deleteThread)
  const deleteThreads = useComposeStore((s) => s.deleteThreads)
  const toggleStarThread = useComposeStore((s) => s.toggleStarThread)
  const [filter, setFilter] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const rows = useMemo(() => {
    // threadOrder already keeps starred first; filter preserves that order.
    return railItems.filter((t) => railItemMatchesQuery(t, filter))
  }, [railItems, filter])

  // Starred threads float above day groups so pins stay visible.
  const starredRows = useMemo(() => rows.filter((t) => t.starred), [rows])
  const unstarredRows = useMemo(() => rows.filter((t) => !t.starred), [rows])
  const dayGroups = useMemo(() => groupThreadsByDay(unstarredRows), [unstarredRows])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelected = useCallback((id: string) => {
    const thread = useComposeStore.getState().threads[id]
    if (thread?.starred) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleDelete = useCallback(
    async (id: string, messageCount: number) => {
      const thread = useComposeStore.getState().threads[id]
      if (thread?.starred) return
      if (messageCount > 0) {
        const ok = await confirmDialog({
          title: 'Delete chat',
          description: 'Messages and draft will be removed.',
          confirmLabel: 'Delete',
          danger: true,
        })
        if (!ok) return
      }
      deleteThread(id)
    },
    [deleteThread],
  )

  const handleBulkDelete = async () => {
    const ids = [...selectedIds].filter((id) => !useComposeStore.getState().threads[id]?.starred)
    if (ids.length === 0) return
    const byId = new Map(railItems.map((t) => [t.id, t]))
    const anyWithMessages = ids.some((id) => (byId.get(id)?.messageCount ?? 0) > 0)
    if (anyWithMessages) {
      const n = ids.length
      const ok = await confirmDialog({
        title: n === 1 ? 'Delete chat' : `Delete ${n} chats`,
        description:
          n === 1
            ? 'Messages and draft will be removed.'
            : 'Messages and drafts will be removed.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return
    }
    deleteThreads(ids)
    exitSelectMode()
  }

  return (
    <div className="w-52 shrink-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)] flex flex-col h-full min-h-0">
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

      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2">
        {rows.length === 0 ? (
          <div className="px-2 py-5 text-[11px] text-[var(--color-text-tertiary)] text-center">
            {filter.trim()
              ? 'No chats match your search'
              : 'No chats yet — choose a context above'}
          </div>
        ) : (
          <>
            {starredRows.length > 0 && (
              <div>
                <div className="px-2 pt-2 pb-1 text-[9px] font-medium tracking-wide uppercase text-[var(--color-text-tertiary)]">
                  Starred
                </div>
                {starredRows.map((item) => (
                  <HistoryThreadRow
                    key={item.id}
                    item={item}
                    selectMode={selectMode}
                    selected={selectedIds.has(item.id)}
                    active={!selectMode && item.id === activeThreadId}
                    onToggle={toggleSelected}
                    onSelect={selectThread}
                    onToggleStar={toggleStarThread}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
            {dayGroups.map((group) => (
              <div key={group.dayKey}>
                <div className="px-2 pt-2 pb-1 text-[9px] font-medium tracking-wide uppercase text-[var(--color-text-tertiary)]">
                  {group.label}
                </div>
                {group.threads.map((item) => (
                  <HistoryThreadRow
                    key={item.id}
                    item={item}
                    selectMode={selectMode}
                    selected={selectedIds.has(item.id)}
                    active={!selectMode && item.id === activeThreadId}
                    onToggle={toggleSelected}
                    onSelect={selectThread}
                    onToggleStar={toggleStarThread}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ))}
          </>
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
