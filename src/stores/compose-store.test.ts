import { describe, it, expect, beforeEach } from 'vitest'
import { useComposeStore, migrateComposeState, ME_CONTEXT } from './compose-store'
import { emptyDraft } from '../lib/compose/types'

function reset() {
  useComposeStore.setState({
    threads: {},
    threadOrder: [],
    activeThreadId: null,
    newThreadContext: { type: 'all' },
    draftDrawerOpen: false,
    model: '',
    xSearch: 'auto',
    isStreaming: false,
    libraryMode: 'auto',
    budgetPct: 0.5,
    dayWindowDays: 7,
    activePostSubTab: 'profile',
    toolActivity: null,
  })
}

describe('compose-store', () => {
  beforeEach(reset)

  it('createThread creates a thread with a single empty segment', () => {
    const id = useComposeStore.getState().createThread({ type: 'me' })
    const thread = useComposeStore.getState().threads[id]
    expect(thread).toBeDefined()
    expect(thread.draft.segments).toHaveLength(1)
    expect(thread.draft.target).toEqual({ kind: 'original' })
    expect(thread.context).toEqual({ type: 'me' })
    expect(thread.title).toBe('New chat')
    expect(useComposeStore.getState().activeThreadId).toBe(id)
    expect(useComposeStore.getState().threadOrder[0]).toBe(id)
  })

  it('selectThread and deleteThread update active and order', () => {
    const s = useComposeStore.getState()
    const a = s.createThread({ type: 'me' })
    const b = s.createThread({ type: 'all' })
    expect(useComposeStore.getState().activeThreadId).toBe(b)
    useComposeStore.getState().selectThread(a)
    expect(useComposeStore.getState().activeThreadId).toBe(a)
    useComposeStore.getState().deleteThread(a)
    expect(useComposeStore.getState().threads[a]).toBeUndefined()
    expect(useComposeStore.getState().activeThreadId).toBe(b)
    expect(useComposeStore.getState().threadOrder).toEqual([b])
  })

  it('ensureActiveThread creates when none active, reuses when present', () => {
    const s = useComposeStore.getState()
    const first = s.ensureActiveThread()
    expect(useComposeStore.getState().threads[first]).toBeDefined()
    expect(useComposeStore.getState().threads[first].context).toEqual({ type: 'all' })
    const again = useComposeStore.getState().ensureActiveThread()
    expect(again).toBe(first)
  })

  it('addMessage sets title from first user message', () => {
    const s = useComposeStore.getState()
    const id = s.createThread()
    s.addMessage(id, { role: 'user', content: 'Write a post about privacy' })
    const thread = useComposeStore.getState().threads[id]
    expect(thread.title).toBe('Write a post about privacy')
    expect(thread.preview).toContain('privacy')
    expect(thread.tokenEstimate).toBeGreaterThan(0)
  })

  it('appends streamed tokens to the last assistant message', () => {
    const s = useComposeStore.getState()
    const id = s.createThread()
    s.addMessage(id, { role: 'user', content: 'hi' })
    s.addMessage(id, { role: 'assistant', content: '' })
    const orderBefore = useComposeStore.getState().threadOrder
    const tokensBefore = useComposeStore.getState().threads[id].tokenEstimate
    s.appendToLastAssistant(id, 'Hel')
    s.appendToLastAssistant(id, 'lo')
    const after = useComposeStore.getState()
    const msgs = after.threads[id].messages
    expect(msgs[msgs.length - 1].content).toBe('Hello')
    // Hot path must not recompute meta / reorder on every token
    expect(after.threadOrder).toEqual(orderBefore)
    expect(after.threads[id].tokenEstimate).toBe(tokensBefore)
  })

  it('applies a draft patch and bumps updatedAt', () => {
    const s = useComposeStore.getState()
    const id = s.createThread()
    const before = useComposeStore.getState().threads[id].draft.updatedAt
    s.applyDraftPatch(id, { segments: [{ id: 'x', text: 'new', media: [] }] })
    const draft = useComposeStore.getState().threads[id].draft
    expect(draft.segments[0].text).toBe('new')
    expect(draft.updatedAt >= before).toBe(true)
  })

  it('patchSegmentsStream skips meta recompute / order bump', () => {
    const s = useComposeStore.getState()
    const id = s.createThread()
    const orderBefore = useComposeStore.getState().threadOrder
    const tokensBefore = useComposeStore.getState().threads[id].tokenEstimate
    const updatedAtBefore = useComposeStore.getState().threads[id].draft.updatedAt
    s.patchSegmentsStream(id, [{ id: 'stream', text: 'hello', media: [] }])
    const after = useComposeStore.getState()
    expect(after.threads[id].draft.segments[0].text).toBe('hello')
    expect(after.threadOrder).toEqual(orderBefore)
    expect(after.threads[id].tokenEstimate).toBe(tokensBefore)
    // Hot path does not touch draft.updatedAt
    expect(after.threads[id].draft.updatedAt).toBe(updatedAtBefore)
  })

  it('setSegmentText is a hot path (no meta / order / timestamp)', () => {
    const s = useComposeStore.getState()
    const id = s.createThread()
    const segId = useComposeStore.getState().threads[id].draft.segments[0].id
    const orderBefore = useComposeStore.getState().threadOrder
    const tokensBefore = useComposeStore.getState().threads[id].tokenEstimate
    const updatedAtBefore = useComposeStore.getState().threads[id].draft.updatedAt
    const titleBefore = useComposeStore.getState().threads[id].title
    s.setSegmentText(id, segId, 'typed live')
    const after = useComposeStore.getState()
    expect(after.threads[id].draft.segments[0].text).toBe('typed live')
    expect(after.threadOrder).toEqual(orderBefore)
    expect(after.threads[id].tokenEstimate).toBe(tokensBefore)
    expect(after.threads[id].draft.updatedAt).toBe(updatedAtBefore)
    expect(after.threads[id].title).toBe(titleBefore)
  })

  it('adds, edits, moves and removes segments', () => {
    const s = useComposeStore.getState()
    const id = s.createThread()
    const firstId = useComposeStore.getState().threads[id].draft.segments[0].id
    s.setSegmentText(id, firstId, 'one')
    s.addSegment(id)
    let segs = useComposeStore.getState().threads[id].draft.segments
    expect(segs).toHaveLength(2)
    const secondId = segs[1].id
    s.setSegmentText(id, secondId, 'two')
    s.moveSegment(id, secondId, -1)
    segs = useComposeStore.getState().threads[id].draft.segments
    expect(segs.map((x) => x.text)).toEqual(['two', 'one'])
    s.removeSegment(id, segs[0].id)
    expect(useComposeStore.getState().threads[id].draft.segments).toHaveLength(1)
  })

  it('never removes the last remaining segment', () => {
    const s = useComposeStore.getState()
    const id = s.createThread()
    const segId = useComposeStore.getState().threads[id].draft.segments[0].id
    s.removeSegment(id, segId)
    expect(useComposeStore.getState().threads[id].draft.segments).toHaveLength(1)
  })

  it('setLastAssistantContent replaces the streamed text (block-strip case)', () => {
    const s = useComposeStore.getState()
    const id = s.createThread()
    s.addMessage(id, { role: 'assistant', content: 'raw with block' })
    s.setLastAssistantContent(id, 'clean prose')
    const msgs = useComposeStore.getState().threads[id].messages
    expect(msgs[msgs.length - 1].content).toBe('clean prose')
  })

  it('defaults library mode, budget, and day window', () => {
    const s = useComposeStore.getState()
    expect(s.libraryMode).toBe('auto')
    expect(s.budgetPct).toBe(0.5)
    expect(s.dayWindowDays).toBe(7)
    expect(s.toolActivity).toBeNull()
    expect(s.newThreadContext).toEqual({ type: 'all' })
  })

  it('clamps budgetPct to 0.25–0.75', () => {
    const s = useComposeStore.getState()
    s.setBudgetPct(0.1)
    expect(useComposeStore.getState().budgetPct).toBe(0.25)
    s.setBudgetPct(0.9)
    expect(useComposeStore.getState().budgetPct).toBe(0.75)
    s.setBudgetPct(0.6)
    expect(useComposeStore.getState().budgetPct).toBe(0.6)
  })

  it('sets library mode, day window, and tool activity', () => {
    const s = useComposeStore.getState()
    s.setLibraryMode('custom')
    s.setDayWindowDays(null)
    s.setToolActivity('Searching library…')
    expect(useComposeStore.getState().libraryMode).toBe('custom')
    expect(useComposeStore.getState().dayWindowDays).toBeNull()
    expect(useComposeStore.getState().toolActivity).toBe('Searching library…')
    s.setToolActivity(null)
    expect(useComposeStore.getState().toolActivity).toBeNull()
  })

  it('migrateComposeState version < 9 sets preferredFormat to auto', () => {
    const migrated = migrateComposeState(
      {
        threads: {},
        threadOrder: [],
        activeThreadId: null,
        model: 'grok',
        webSearch: 'auto',
      },
      8,
    )
    expect(migrated.preferredFormat).toBe('auto')
  })

  it('migrateComposeState version < 12 defaults empty draftModel to same', () => {
    const migrated = migrateComposeState(
      {
        threads: {},
        threadOrder: [],
        activeThreadId: null,
        model: 'grok',
        draftModel: '',
        preferredFormat: 'auto',
        xNewsOn: true,
        xNewsMaxAgeHours: 24,
      },
      11,
    )
    expect(migrated.draftModel).toBe('same')
  })

  it('migrateComposeState defaults activePostSubTab to profile', () => {
    const migrated = migrateComposeState(
      {
        threads: {},
        threadOrder: [],
        activeThreadId: null,
        model: 'grok',
        draftModel: 'same',
        preferredFormat: 'auto',
      },
      12,
    )
    expect(migrated.activePostSubTab).toBe('profile')
  })

  it('setActivePostSubTab updates Post sub-tab', () => {
    useComposeStore.getState().setActivePostSubTab('feed')
    expect(useComposeStore.getState().activePostSubTab).toBe('feed')
    useComposeStore.getState().setActivePostSubTab('profile')
    expect(useComposeStore.getState().activePostSubTab).toBe('profile')
  })

  it('migrateComposeState v3 sessions → v4 threads', () => {
    const olderDraft = emptyDraft({ kind: 'original' })
    olderDraft.updatedAt = '2024-01-01T00:00:00.000Z'
    const newerDraft = emptyDraft({ kind: 'original' })
    newerDraft.updatedAt = '2024-06-01T00:00:00.000Z'

    const migrated = migrateComposeState(
      {
        sessions: {
          [ME_CONTEXT]: {
            messages: [{ role: 'user', content: 'Hello from me' }],
            draft: olderDraft,
          },
          AskVenice: {
            messages: [{ role: 'user', content: 'About Venice' }],
            draft: newerDraft,
          },
        },
        activeContext: 'AskVenice',
        model: 'grok',
        xSearch: 'auto',
        longformPreference: true,
        libraryMode: 'auto',
        budgetPct: 0.5,
        dayWindowDays: 7,
      },
      3,
    )

    const raw = migrated as unknown as Record<string, unknown>
    expect(raw.sessions).toBeUndefined()
    expect(raw.activeContext).toBeUndefined()
    expect(Object.keys(migrated.threads)).toHaveLength(2)
    expect(migrated.threadOrder).toHaveLength(2)
    // Newer updatedAt first
    const firstId = migrated.threadOrder[0]
    expect(migrated.threads[firstId].context).toEqual({ type: 'target', username: 'AskVenice' })
    expect(migrated.activeThreadId).toBe(firstId)
    expect(migrated.newThreadContext).toEqual({ type: 'target', username: 'AskVenice' })
    const meThread = Object.values(migrated.threads).find((t) => t.context.type === 'me')
    expect(meThread?.title).toBe('Hello from me')
  })
})
