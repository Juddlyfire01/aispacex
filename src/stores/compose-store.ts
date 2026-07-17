import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LibraryMode } from '../lib/compose/hot-window'
import type { PreferredFormat } from '../lib/compose/format'
import type { PostDraft, PostSegment, PostTarget } from '../lib/compose/types'
import { emptyDraft, emptySegment } from '../lib/compose/types'
import type { RegisterDefault } from '../lib/compose/register'
import { DEFAULT_REGISTER_DEFAULT } from '../lib/compose/register'
import type { ComposeMessage, ComposeThread, CompressArchive } from '../lib/compose/thread-types'
import { recomputeThreadMeta } from '../lib/compose/thread-meta'
import { clampBudgetPct, DEFAULT_CONTEXT_FALLBACK } from '../lib/compose/token-estimate'
import type { ComposeScope } from '../lib/intel-library/types'
import { scopeFromContext } from '../lib/intel-library/scope'
import { createDebouncedJSONStorage } from '../lib/encrypted-storage'
import type { AgentEvent, AgentEventStatus } from '../lib/compose/agent-events'
import { DRAFT_MODEL_SAME } from '../lib/compose/draft-writer-tool'
import { sortStarredFirst } from '../lib/starred-order'

// Context key constants for scope ↔ string conversion (scope.ts, UI selects).
export const ME_CONTEXT = '__me__'
export const ALL_CONTEXT = '__all__'

export type { LibraryMode }
export type { ComposeThread }
export type { PreferredFormat }

export type XSearchMode = 'off' | 'auto' | 'on'
/** Same off/auto/on shape as X search — Venice `enable_web_search`. */
export type WebSearchMode = 'off' | 'auto' | 'on'

/** Post top-tab sub-chrome: Composer | Alpha | Performance. */
export type PostSubTab = 'composer' | 'alpha' | 'performance'

const POST_SUB_TABS: readonly PostSubTab[] = ['composer', 'alpha', 'performance']

function isPostSubTab(v: unknown): v is PostSubTab {
  return typeof v === 'string' && (POST_SUB_TABS as readonly string[]).includes(v)
}

/** Map legacy profile/feed/network placeholders → real Post tabs. */
export function migratePostSubTab(v: unknown): PostSubTab {
  if (isPostSubTab(v)) return v
  if (v === 'profile') return 'composer'
  if (v === 'feed') return 'performance'
  if (v === 'network') return 'alpha'
  return 'composer'
}

/** Legacy session shape (persist versions < 4). */
interface LegacyComposeSession {
  messages: ComposeMessage[]
  draft: PostDraft
}

interface ComposeState {
  threads: Record<string, ComposeThread>
  threadOrder: string[]
  activeThreadId: string | null
  newThreadContext: ComposeScope
  draftDrawerOpen: boolean
  /** Draft pane width as % of the chat+draft split (25–75). Default 50. */
  draftDrawerWidthPct: number
  model: string
  /** Draft writer: 'same' = continue research turn; else a Venice model id for handoff. */
  draftModel: string
  xSearch: XSearchMode
  /** Venice native web search (`enable_web_search`). */
  webSearch: WebSearchMode
  /** X News API tools (`x_news_*`) in the compose agent. Default on. */
  xNewsOn: boolean
  /** X News search recency window in hours. Default 24. */
  xNewsMaxAgeHours: number
  isStreaming: boolean
  /** Ephemeral — true while the draft writer is streaming into the drawer. */
  draftWriterStreaming: boolean
  /** Persisted long-form default for verified accounts (user can opt out). */
  longformPreference: boolean
  /** App-wide default register mode for new drafts. */
  registerDefault: RegisterDefault
  libraryMode: LibraryMode
  budgetPct: number
  /** null = all time */
  dayWindowDays: number | null
  /** Post → Composer / Alpha / Performance. Persisted across refresh. */
  activePostSubTab: PostSubTab
  /** Ephemeral tool activity label — not persisted. */
  toolActivity: string | null
  /** Ephemeral Cursor-style step timeline for the current run — not persisted. */
  agentEvents: AgentEvent[]
  /** Current top-level phase label shown while no step is running. */
  agentPhase: string | null
  /** Model context limit for the meter — ephemeral; recompute from model list. */
  contextLimit: number

  createThread: (context?: ComposeScope, target?: PostTarget) => string
  selectThread: (id: string | null) => void
  deleteThread: (id: string) => void
  /** Remove many threads in one store update (history rail bulk delete). Starred ids are skipped. */
  deleteThreads: (ids: string[]) => void
  /** Toggle star; starred threads pin to top and refuse delete. */
  toggleStarThread: (id: string) => void
  ensureActiveThread: () => string
  getActiveThread: () => ComposeThread | undefined
  setNewThreadContext: (scope: ComposeScope) => void
  setDraftDrawerOpen: (open: boolean) => void
  setDraftDrawerWidthPct: (pct: number) => void
  setDraftWriterStreaming: (streaming: boolean) => void
  /**
   * Hot path for draft-writer article tokens — skips thread meta / order bump
   * (same idea as appendToLastAssistant) so streaming stays smooth.
   */
  patchArticleStream: (
    threadId: string,
    patch: { title: string; bodyMarkdown: string },
  ) => void
  /**
   * Hot path for draft-writer post/thread segments — skips meta / order bump.
   * Finalize with applyDraftPatch (or setLastAssistantContent-style path) once.
   */
  patchSegmentsStream: (threadId: string, segments: PostSegment[]) => void

  addMessage: (threadId: string, message: ComposeMessage) => void
  appendToLastAssistant: (threadId: string, token: string) => void
  setLastAssistantContent: (threadId: string, content: string) => void
  /** Attach the completed agent step timeline to the last assistant message. */
  setLastAssistantAgentEvents: (threadId: string, events: AgentEvent[]) => void
  deleteLastMessage: (threadId: string) => void
  /** Stack a cold compress archive (newest first) and replace live messages. */
  applyThreadCompress: (
    threadId: string,
    archive: CompressArchive,
    nextMessages: ComposeMessage[],
  ) => void

  applyDraftPatch: (threadId: string, patch: Partial<PostDraft>) => void
  setSegmentText: (threadId: string, segmentId: string, text: string) => void
  addSegment: (threadId: string, afterSegmentId?: string) => void
  removeSegment: (threadId: string, segmentId: string) => void
  moveSegment: (threadId: string, segmentId: string, dir: -1 | 1) => void
  setTarget: (threadId: string, target: PostTarget) => void
  patchSegment: (threadId: string, segmentId: string, patch: Partial<PostSegment>) => void
  resetDraft: (threadId: string) => void

  setModel: (model: string) => void
  setDraftModel: (model: string) => void
  setXSearch: (mode: XSearchMode) => void
  setWebSearch: (mode: WebSearchMode) => void
  setXNewsOn: (on: boolean) => void
  setXNewsMaxAgeHours: (hours: number) => void
  /** Set the preferred draft format for a specific thread (persisted). */
  setPreferredFormat: (threadId: string, format: PreferredFormat) => void
  setStreaming: (streaming: boolean) => void
  setLongformPreference: (enabled: boolean) => void
  setRegisterDefault: (def: RegisterDefault) => void
  setLibraryMode: (mode: LibraryMode) => void
  setBudgetPct: (pct: number) => void
  setDayWindowDays: (days: number | null) => void
  setActivePostSubTab: (tab: PostSubTab) => void
  setToolActivity: (label: string | null) => void
  setContextLimit: (limit: number) => void

  pushAgentEvent: (event: AgentEvent) => void
  updateAgentEvent: (
    id: string,
    patch: {
      status?: AgentEventStatus
      detail?: string
      label?: string
      progressLabel?: string
    },
  ) => void
  clearAgentEvents: () => void
  setAgentPhase: (phase: string | null) => void
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function touch(draft: PostDraft): PostDraft {
  return { ...draft, updatedAt: new Date().toISOString() }
}

/** Move thread to front of its partition (starred block, then unstarred). */
function bumpOrder(
  order: string[],
  threadId: string,
  threads: Record<string, ComposeThread>,
): string[] {
  const next = [threadId, ...order.filter((id) => id !== threadId)]
  return sortStarredFirst(next, (id) => Boolean(threads[id]?.starred))
}

function mapThread(
  state: ComposeState,
  threadId: string,
  fn: (thread: ComposeThread) => ComposeThread,
): Partial<ComposeState> {
  const thread = state.threads[threadId]
  if (!thread) return {}
  const next = fn(thread)
  const meta = recomputeThreadMeta({
    messages: next.messages,
    draft: next.draft,
    title: next.title,
  })
  const updated: ComposeThread = { ...next, ...meta }
  const threads = { ...state.threads, [threadId]: updated }
  return {
    threads,
    threadOrder: bumpOrder(state.threadOrder, threadId, threads),
  }
}

function mapDraft(
  state: ComposeState,
  threadId: string,
  fn: (draft: PostDraft) => PostDraft,
): Partial<ComposeState> {
  return mapThread(state, threadId, (t) => ({ ...t, draft: touch(fn(t.draft)) }))
}

/** Migrate persisted compose state; exported for unit tests. */
export function migrateComposeState(persisted: unknown, version: number): ComposeState {
  const state = { ...(persisted as Record<string, unknown>) } as Record<string, unknown>

  if (version < 2 && state.longformPreference == null) {
    state.longformPreference = true
  }
  if (version < 3) {
    if (state.libraryMode == null) state.libraryMode = 'auto'
    if (state.budgetPct == null) state.budgetPct = 0.5
    if (state.dayWindowDays === undefined) state.dayWindowDays = 7
  }

  if (version < 5 && state.registerDefault == null) {
    state.registerDefault = { ...DEFAULT_REGISTER_DEFAULT }
  }
  if (version < 6 && state.draftModel == null) {
    state.draftModel = DRAFT_MODEL_SAME
  }
  if (version < 7 && state.threads) {
    for (const thread of Object.values(state.threads as Record<string, ComposeThread>)) {
      if (!Array.isArray(thread.compressArchives)) thread.compressArchives = []
    }
  }
  if (version < 8 && state.webSearch == null) {
    state.webSearch = 'auto'
  }
  if (version < 9 && state.preferredFormat == null) {
    state.preferredFormat = 'auto'
  }
  if (version < 10 && state.draftDrawerWidthPct == null) {
    state.draftDrawerWidthPct = 50
  }
  if (version < 11) {
    if (state.xNewsOn == null) state.xNewsOn = true
    if (state.xNewsMaxAgeHours == null) state.xNewsMaxAgeHours = 24
  }
  if (version < 12) {
    // Default draft writer to Same as main (empty / unset → same).
    if (state.draftModel == null || state.draftModel === '') {
      state.draftModel = DRAFT_MODEL_SAME
    }
  }
  if (version < 14 && state.threads) {
    const threads = state.threads as Record<string, ComposeThread>
    for (const thread of Object.values(threads)) {
      if (thread.starred == null) thread.starred = false
    }
    const order = Array.isArray(state.threadOrder)
      ? (state.threadOrder as string[])
      : Object.keys(threads)
    state.threadOrder = sortStarredFirst(order, (id) => Boolean(threads[id]?.starred))
  }
  // preferredFormat was session-only (default auto) — drop any persisted choice.
  if (version < 15) {
    state.preferredFormat = 'auto'
  }
  // v16: preferredFormat becomes per-thread + persisted. Backfill every thread
  // to 'auto' and drop the old top-level field.
  if (version < 16) {
    if (state.threads) {
      for (const thread of Object.values(state.threads as Record<string, ComposeThread>)) {
        if (thread.preferredFormat == null) thread.preferredFormat = 'auto'
      }
    }
    delete state.preferredFormat
  }

  if (version < 4) {
    const sessions = (state.sessions ?? {}) as Record<string, LegacyComposeSession>
    const activeContext = typeof state.activeContext === 'string' ? state.activeContext : ME_CONTEXT
    const threads: Record<string, ComposeThread> = {}
    const entries: { id: string; key: string; updatedAt: string }[] = []

    for (const [key, session] of Object.entries(sessions)) {
      if (!session) continue
      const id = newId()
      const messages = session.messages ?? []
      const draft = session.draft ?? emptyDraft({ kind: 'original' })
      const createdAt = draft.createdAt ?? new Date().toISOString()
      const meta = recomputeThreadMeta({
        messages,
        draft,
        title: 'New chat',
      })
      threads[id] = {
        id,
        context: scopeFromContext(key),
        title: meta.title,
        createdAt,
        updatedAt: draft.updatedAt ?? meta.updatedAt,
        messages,
        draft,
        tokenEstimate: meta.tokenEstimate,
        preview: meta.preview,
        compressArchives: [],
      }
      entries.push({ id, key, updatedAt: draft.updatedAt ?? meta.updatedAt })
    }

    entries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    const threadOrder = entries.map((e) => e.id)
    const activeEntry = entries.find((e) => e.key === activeContext)
    const activeThreadId = activeEntry?.id ?? threadOrder[0] ?? null

    state.threads = threads
    state.threadOrder = threadOrder
    state.activeThreadId = activeThreadId
    state.newThreadContext = scopeFromContext(activeContext)
    delete state.sessions
    delete state.activeContext
  }

  if (state.threads == null) state.threads = {}
  if (state.threadOrder == null) state.threadOrder = []
  if (state.activeThreadId === undefined) state.activeThreadId = null
  if (state.newThreadContext == null) state.newThreadContext = { type: 'all' }
  if (state.draftDrawerOpen == null) state.draftDrawerOpen = false
  state.activePostSubTab = migratePostSubTab(state.activePostSubTab)
  // Defensive: every thread should carry a preferredFormat (default auto).
  for (const thread of Object.values(state.threads as Record<string, ComposeThread>)) {
    if (thread.preferredFormat == null) thread.preferredFormat = 'auto'
  }

  return state as unknown as ComposeState
}

export const useComposeStore = create<ComposeState>()(
  persist(
    (set, get) => ({
      threads: {},
      threadOrder: [],
      activeThreadId: null,
      newThreadContext: { type: 'all' },
      draftDrawerOpen: false,
      draftDrawerWidthPct: 50,
      model: '',
      draftModel: DRAFT_MODEL_SAME,
      xSearch: 'auto',
      webSearch: 'auto',
      xNewsOn: true,
      xNewsMaxAgeHours: 24,
      isStreaming: false,
      draftWriterStreaming: false,
      longformPreference: true,
      registerDefault: { ...DEFAULT_REGISTER_DEFAULT },
      libraryMode: 'auto',
      budgetPct: 0.5,
      dayWindowDays: 7,
      activePostSubTab: 'composer',
      toolActivity: null,
      agentEvents: [],
      agentPhase: null,
      contextLimit: DEFAULT_CONTEXT_FALLBACK,

      createThread: (context, target) => {
        const id = newId()
        const now = new Date().toISOString()
        const s = get()
        const scope = context ?? s.newThreadContext
        const draft = emptyDraft(target ?? { kind: 'original' }, {
          longform: s.longformPreference,
          registerDefault: s.registerDefault,
        })
        const meta = recomputeThreadMeta({ messages: [], draft, title: 'New chat' })
        const thread: ComposeThread = {
          id,
          context: scope,
          title: meta.title,
          createdAt: now,
          updatedAt: meta.updatedAt,
          messages: [],
          draft,
          tokenEstimate: meta.tokenEstimate,
          preview: meta.preview,
          preferredFormat: 'auto',
          starred: false,
          compressArchives: [],
        }
        set((prev) => {
          const threads = { ...prev.threads, [id]: thread }
          return {
            threads,
            threadOrder: bumpOrder(prev.threadOrder, id, threads),
            activeThreadId: id,
          }
        })
        return id
      },

      selectThread: (id) => set({ activeThreadId: id }),

      deleteThread: (id) => get().deleteThreads([id]),

      deleteThreads: (ids) =>
        set((s) => {
          if (ids.length === 0) return s
          // Starred threads are protected — skip them entirely.
          const idSet = new Set(ids.filter((id) => !s.threads[id]?.starred))
          if (idSet.size === 0) return s
          const threads = { ...s.threads }
          for (const id of idSet) delete threads[id]
          const threadOrder = s.threadOrder.filter((tid) => !idSet.has(tid))
          const activeThreadId =
            s.activeThreadId && idSet.has(s.activeThreadId)
              ? (threadOrder[0] ?? null)
              : s.activeThreadId
          return { threads, threadOrder, activeThreadId }
        }),

      toggleStarThread: (id) =>
        set((s) => {
          const thread = s.threads[id]
          if (!thread) return s
          const updated = { ...thread, starred: !thread.starred }
          const threads = { ...s.threads, [id]: updated }
          return {
            threads,
            threadOrder: sortStarredFirst(s.threadOrder, (tid) => Boolean(threads[tid]?.starred)),
          }
        }),

      ensureActiveThread: () => {
        const s = get()
        if (s.activeThreadId && s.threads[s.activeThreadId]) return s.activeThreadId
        return get().createThread()
      },

      getActiveThread: () => {
        const s = get()
        return s.activeThreadId ? s.threads[s.activeThreadId] : undefined
      },

      setNewThreadContext: (scope) => set({ newThreadContext: scope }),
      setDraftDrawerOpen: (open) => set({ draftDrawerOpen: open }),
      setDraftDrawerWidthPct: (pct) =>
        set({ draftDrawerWidthPct: Math.min(75, Math.max(25, Math.round(pct))) }),
      setDraftWriterStreaming: (streaming) => set({ draftWriterStreaming: streaming }),

      // Hot path: do NOT recomputeThreadMeta / bumpOrder on every writer token
      // or keystroke into the article title/body.
      patchArticleStream: (threadId, patch) =>
        set((s) => {
          const thread = s.threads[threadId]
          if (!thread) return {}
          const prev = thread.draft.article
          const nextTitle = patch.title
          const nextBody = patch.bodyMarkdown
          if (
            prev &&
            prev.title === nextTitle &&
            prev.bodyMarkdown === nextBody
          ) {
            return {}
          }
          return {
            threads: {
              ...s.threads,
              [threadId]: {
                ...thread,
                draft: {
                  ...thread.draft,
                  longform: false,
                  target: { kind: 'original' as const },
                  article: {
                    title: nextTitle,
                    bodyMarkdown: nextBody,
                    cover: prev?.cover,
                    inlineMedia: prev?.inlineMedia ?? [],
                    contentState: prev?.contentState,
                  },
                },
              },
            },
          }
        }),

      patchSegmentsStream: (threadId, segments) =>
        set((s) => {
          const thread = s.threads[threadId]
          if (!thread) return {}
          return {
            threads: {
              ...s.threads,
              [threadId]: {
                ...thread,
                draft: {
                  ...thread.draft,
                  segments,
                  article: undefined,
                },
              },
            },
          }
        }),

      addMessage: (threadId, message) =>
        set((s) =>
          mapThread(s, threadId, (t) => ({ ...t, messages: [...t.messages, message] })),
        ),

      // Hot path: do NOT recomputeThreadMeta / bumpOrder / touch draft timestamps
      // on every token — that + encrypted persist made streaming feel click-clunky.
      // Meta is refreshed once via setLastAssistantContent when the stream ends.
      appendToLastAssistant: (threadId, token) =>
        set((s) => {
          const thread = s.threads[threadId]
          if (!thread) return {}
          const last = thread.messages[thread.messages.length - 1]
          if (last?.role !== 'assistant' || typeof last.content !== 'string') return {}
          const msgs = thread.messages.slice()
          msgs[msgs.length - 1] = { ...last, content: last.content + token }
          return {
            threads: { ...s.threads, [threadId]: { ...thread, messages: msgs } },
          }
        }),

      setLastAssistantContent: (threadId, content) =>
        set((s) =>
          mapThread(s, threadId, (t) => {
            const msgs = [...t.messages]
            const last = msgs[msgs.length - 1]
            if (last?.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, content }
            }
            return { ...t, messages: msgs }
          }),
        ),

      setLastAssistantAgentEvents: (threadId, events) =>
        set((s) =>
          mapThread(s, threadId, (t) => {
            const msgs = [...t.messages]
            const last = msgs[msgs.length - 1]
            if (last?.role !== 'assistant') return t
            msgs[msgs.length - 1] = {
              ...last,
              agentEvents: events.length > 0 ? events : undefined,
            }
            return { ...t, messages: msgs }
          }),
        ),

      deleteLastMessage: (threadId) =>
        set((s) =>
          mapThread(s, threadId, (t) => ({ ...t, messages: t.messages.slice(0, -1) })),
        ),

      applyThreadCompress: (threadId, archive, nextMessages) =>
        set((s) =>
          mapThread(s, threadId, (t) => ({
            ...t,
            compressArchives: [archive, ...(t.compressArchives ?? [])],
            messages: nextMessages,
          })),
        ),

      applyDraftPatch: (threadId, patch) =>
        set((s) => mapDraft(s, threadId, (draft) => ({ ...draft, ...patch }))),

      // Hot path: typing into a segment must not recomputeThreadMeta / bumpOrder /
      // touch timestamps — that + full-thread JSON persist made every keystroke lag.
      // Meta is refreshed on structural draft changes (add/remove/move) and finalize.
      setSegmentText: (threadId, segmentId, text) =>
        set((s) => {
          const thread = s.threads[threadId]
          if (!thread) return {}
          const segs = thread.draft.segments
          const idx = segs.findIndex((seg) => seg.id === segmentId)
          if (idx < 0) return {}
          const cur = segs[idx]!
          if (cur.text === text) return {}
          const nextSegs = segs.slice()
          nextSegs[idx] = { ...cur, text }
          return {
            threads: {
              ...s.threads,
              [threadId]: {
                ...thread,
                draft: { ...thread.draft, segments: nextSegs },
              },
            },
          }
        }),

      patchSegment: (threadId, segmentId, patch) =>
        set((s) => {
          // Media/poll structural edits still use full mapDraft (meta refresh).
          if (
            patch.media !== undefined ||
            patch.poll !== undefined ||
            Object.keys(patch).some((k) => k !== 'text')
          ) {
            return mapDraft(s, threadId, (draft) => ({
              ...draft,
              segments: draft.segments.map((seg) =>
                seg.id === segmentId ? { ...seg, ...patch } : seg,
              ),
            }))
          }
          // Text-only → same hot path as setSegmentText.
          if (typeof patch.text === 'string') {
            const thread = s.threads[threadId]
            if (!thread) return {}
            const segs = thread.draft.segments
            const idx = segs.findIndex((seg) => seg.id === segmentId)
            if (idx < 0) return {}
            const cur = segs[idx]!
            if (cur.text === patch.text) return {}
            const nextSegs = segs.slice()
            nextSegs[idx] = { ...cur, text: patch.text }
            return {
              threads: {
                ...s.threads,
                [threadId]: {
                  ...thread,
                  draft: { ...thread.draft, segments: nextSegs },
                },
              },
            }
          }
          return {}
        }),

      addSegment: (threadId, afterSegmentId) =>
        set((s) =>
          mapDraft(s, threadId, (draft) => {
            const next = emptySegment()
            if (!afterSegmentId) {
              return { ...draft, segments: [...draft.segments, next] }
            }
            const idx = draft.segments.findIndex((seg) => seg.id === afterSegmentId)
            if (idx === -1) {
              return { ...draft, segments: [...draft.segments, next] }
            }
            const segments = [
              ...draft.segments.slice(0, idx + 1),
              next,
              ...draft.segments.slice(idx + 1),
            ]
            return { ...draft, segments }
          }),
        ),

      removeSegment: (threadId, segmentId) =>
        set((s) =>
          mapDraft(s, threadId, (draft) => {
            if (draft.segments.length <= 1) return draft
            return { ...draft, segments: draft.segments.filter((seg) => seg.id !== segmentId) }
          }),
        ),

      moveSegment: (threadId, segmentId, dir) =>
        set((s) =>
          mapDraft(s, threadId, (draft) => {
            const idx = draft.segments.findIndex((seg) => seg.id === segmentId)
            const next = idx + dir
            if (idx === -1 || next < 0 || next >= draft.segments.length) return draft
            const segments = [...draft.segments]
            ;[segments[idx], segments[next]] = [segments[next], segments[idx]]
            return { ...draft, segments }
          }),
        ),

      setTarget: (threadId, target) =>
        set((s) => mapDraft(s, threadId, (draft) => ({ ...draft, target }))),

      resetDraft: (threadId) =>
        set((s) =>
          mapThread(s, threadId, (t) => ({
            ...t,
            draft: emptyDraft(t.draft.target, {
              longform: s.longformPreference,
              registerDefault: s.registerDefault,
            }),
          })),
        ),

      setModel: (model) => set({ model }),
      setDraftModel: (model) => set({ draftModel: model }),
      setXSearch: (mode) => set({ xSearch: mode }),
      setWebSearch: (mode) => set({ webSearch: mode }),
      setXNewsOn: (on) => set({ xNewsOn: on }),
      setXNewsMaxAgeHours: (hours) =>
        set({
          xNewsMaxAgeHours: Math.min(168, Math.max(1, Math.round(hours) || 24)),
        }),
      setPreferredFormat: (threadId, format) =>
        set((s) => {
          const thread = s.threads[threadId]
          if (!thread || thread.preferredFormat === format) return {}
          // Light update: a format toggle should not bump thread order or meta.
          return {
            threads: {
              ...s.threads,
              [threadId]: { ...thread, preferredFormat: format },
            },
          }
        }),
      setStreaming: (streaming) => set({ isStreaming: streaming }),
      setLongformPreference: (enabled) => set({ longformPreference: enabled }),
      setRegisterDefault: (def) => set({ registerDefault: def }),
      setLibraryMode: (mode) => set({ libraryMode: mode }),
      setBudgetPct: (pct) => set({ budgetPct: clampBudgetPct(pct) }),
      setDayWindowDays: (days) => set({ dayWindowDays: days }),
      setActivePostSubTab: (tab) => set({ activePostSubTab: tab }),
      setToolActivity: (label) => set({ toolActivity: label }),
      setContextLimit: (limit) => set({ contextLimit: limit }),

      pushAgentEvent: (event) => set((s) => ({ agentEvents: [...s.agentEvents, event] })),
      updateAgentEvent: (id, patch) =>
        set((s) => ({
          agentEvents: s.agentEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      clearAgentEvents: () => set({ agentEvents: [] }),
      setAgentPhase: (phase) => set({ agentPhase: phase }),
    }),
    {
      name: 'venice-compose',
      version: 17,
      // Debounced JSON + AES-GCM: avoid stringify/encrypt on every keystroke.
      storage: createDebouncedJSONStorage(),
      migrate: (persisted, version) => migrateComposeState(persisted, version),
      partialize: (state) => ({
        threads: state.threads,
        threadOrder: state.threadOrder,
        activeThreadId: state.activeThreadId,
        newThreadContext: state.newThreadContext,
        // Restore open draft drawer after refresh so WIP stays visible.
        draftDrawerOpen: state.draftDrawerOpen,
        model: state.model,
        draftModel: state.draftModel,
        xSearch: state.xSearch,
        webSearch: state.webSearch,
        xNewsOn: state.xNewsOn,
        xNewsMaxAgeHours: state.xNewsMaxAgeHours,
        // preferredFormat now lives per-thread (persisted inside `threads`).
        draftDrawerWidthPct: state.draftDrawerWidthPct,
        longformPreference: state.longformPreference,
        registerDefault: state.registerDefault,
        libraryMode: state.libraryMode,
        budgetPct: state.budgetPct,
        dayWindowDays: state.dayWindowDays,
        activePostSubTab: state.activePostSubTab,
      }),
    },
  ),
)
