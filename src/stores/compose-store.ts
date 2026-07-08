import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatMessage } from '../types/venice'
import type { PostDraft, PostSegment, PostTarget } from '../lib/compose/types'
import { emptyDraft, emptySegment } from '../lib/compose/types'
import { createSafeStorage } from '../lib/safe-storage'

// A compose session is a chat transcript plus the draft it's shaping. Sessions
// are keyed by context so composing an original ("__me__") and composing in
// reference to a target keep separate transcripts and drafts.

export const ME_CONTEXT = '__me__'
// Whole-corpus context: composing/discussing against the entire gathered data
// set (every connected self account + every target report) rather than one
// subject. Keyed like any other context, so it gets its own transcript + draft.
export const ALL_CONTEXT = '__all__'

export interface ComposeSession {
  messages: ChatMessage[]
  draft: PostDraft
}

export type XSearchMode = 'off' | 'auto' | 'on'

interface ComposeState {
  sessions: Record<string, ComposeSession>
  activeContext: string
  model: string
  xSearch: XSearchMode
  isStreaming: boolean
  /** Persisted long-form default for verified accounts (user can opt out). */
  longformPreference: boolean

  ensureSession: (context: string, target?: PostTarget) => void
  setActiveContext: (context: string) => void
  getSession: (context: string) => ComposeSession | undefined

  addMessage: (context: string, message: ChatMessage) => void
  appendToLastAssistant: (context: string, token: string) => void
  setLastAssistantContent: (context: string, content: string) => void
  deleteLastMessage: (context: string) => void

  applyDraftPatch: (context: string, patch: Partial<PostDraft>) => void
  setSegmentText: (context: string, segmentId: string, text: string) => void
  addSegment: (context: string) => void
  removeSegment: (context: string, segmentId: string) => void
  moveSegment: (context: string, segmentId: string, dir: -1 | 1) => void
  setTarget: (context: string, target: PostTarget) => void
  patchSegment: (context: string, segmentId: string, patch: Partial<PostSegment>) => void
  resetDraft: (context: string) => void

  setModel: (model: string) => void
  setXSearch: (mode: XSearchMode) => void
  setStreaming: (streaming: boolean) => void
  setLongformPreference: (enabled: boolean) => void
}

function touch(draft: PostDraft): PostDraft {
  return { ...draft, updatedAt: new Date().toISOString() }
}

function mapSession(
  state: ComposeState,
  context: string,
  fn: (session: ComposeSession) => ComposeSession,
): Partial<ComposeState> {
  const session = state.sessions[context]
  if (!session) return {}
  return { sessions: { ...state.sessions, [context]: fn(session) } }
}

function mapDraft(
  state: ComposeState,
  context: string,
  fn: (draft: PostDraft) => PostDraft,
): Partial<ComposeState> {
  return mapSession(state, context, (s) => ({ ...s, draft: touch(fn(s.draft)) }))
}

export const useComposeStore = create<ComposeState>()(
  persist(
    (set, get) => ({
      sessions: {},
      activeContext: ME_CONTEXT,
      model: '',
      xSearch: 'auto',
      isStreaming: false,
      longformPreference: true,

      ensureSession: (context, target) =>
        set((s) => {
          if (s.sessions[context]) return {}
          return {
            sessions: {
              ...s.sessions,
              [context]: {
                messages: [],
                draft: emptyDraft(target ?? { kind: 'original' }, { longform: s.longformPreference }),
              },
            },
          }
        }),

      setActiveContext: (context) => set({ activeContext: context }),

      getSession: (context) => get().sessions[context],

      addMessage: (context, message) =>
        set((s) => mapSession(s, context, (sess) => ({ ...sess, messages: [...sess.messages, message] }))),

      appendToLastAssistant: (context, token) =>
        set((s) =>
          mapSession(s, context, (sess) => {
            const msgs = [...sess.messages]
            const last = msgs[msgs.length - 1]
            if (last?.role === 'assistant' && typeof last.content === 'string') {
              msgs[msgs.length - 1] = { ...last, content: last.content + token }
            }
            return { ...sess, messages: msgs }
          }),
        ),

      setLastAssistantContent: (context, content) =>
        set((s) =>
          mapSession(s, context, (sess) => {
            const msgs = [...sess.messages]
            const last = msgs[msgs.length - 1]
            if (last?.role === 'assistant') {
              msgs[msgs.length - 1] = { ...last, content }
            }
            return { ...sess, messages: msgs }
          }),
        ),

      deleteLastMessage: (context) =>
        set((s) => mapSession(s, context, (sess) => ({ ...sess, messages: sess.messages.slice(0, -1) }))),

      applyDraftPatch: (context, patch) =>
        set((s) => mapDraft(s, context, (draft) => ({ ...draft, ...patch }))),

      setSegmentText: (context, segmentId, text) =>
        set((s) =>
          mapDraft(s, context, (draft) => ({
            ...draft,
            segments: draft.segments.map((seg) => (seg.id === segmentId ? { ...seg, text } : seg)),
          })),
        ),

      patchSegment: (context, segmentId, patch) =>
        set((s) =>
          mapDraft(s, context, (draft) => ({
            ...draft,
            segments: draft.segments.map((seg) => (seg.id === segmentId ? { ...seg, ...patch } : seg)),
          })),
        ),

      addSegment: (context) =>
        set((s) => mapDraft(s, context, (draft) => ({ ...draft, segments: [...draft.segments, emptySegment()] }))),

      removeSegment: (context, segmentId) =>
        set((s) =>
          mapDraft(s, context, (draft) => {
            if (draft.segments.length <= 1) return draft
            return { ...draft, segments: draft.segments.filter((seg) => seg.id !== segmentId) }
          }),
        ),

      moveSegment: (context, segmentId, dir) =>
        set((s) =>
          mapDraft(s, context, (draft) => {
            const idx = draft.segments.findIndex((seg) => seg.id === segmentId)
            const next = idx + dir
            if (idx === -1 || next < 0 || next >= draft.segments.length) return draft
            const segments = [...draft.segments]
            ;[segments[idx], segments[next]] = [segments[next], segments[idx]]
            return { ...draft, segments }
          }),
        ),

      setTarget: (context, target) =>
        set((s) => mapDraft(s, context, (draft) => ({ ...draft, target }))),

      resetDraft: (context) =>
        set((s) =>
          mapSession(s, context, (sess) => ({
            ...sess,
            draft: emptyDraft(sess.draft.target, { longform: s.longformPreference }),
          })),
        ),

      setModel: (model) => set({ model }),
      setXSearch: (mode) => set({ xSearch: mode }),
      setStreaming: (streaming) => set({ isStreaming: streaming }),
      setLongformPreference: (enabled) => set({ longformPreference: enabled }),
    }),
    {
      name: 'venice-compose',
      version: 2,
      storage: createJSONStorage(() => createSafeStorage()),
      migrate: (persisted, version) => {
        const state = persisted as Partial<ComposeState>
        if (version < 2 && state.longformPreference == null) {
          state.longformPreference = true
        }
        return state as ComposeState
      },
      partialize: (state) => ({
        sessions: state.sessions,
        activeContext: state.activeContext,
        model: state.model,
        xSearch: state.xSearch,
        longformPreference: state.longformPreference,
      }),
    },
  ),
)
