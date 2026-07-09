import { describe, it, expect, beforeEach } from 'vitest'
import { useComposeStore, ME_CONTEXT } from './compose-store'

function reset() {
  useComposeStore.setState({
    sessions: {},
    activeContext: ME_CONTEXT,
    model: '',
    xSearch: 'auto',
    isStreaming: false,
    libraryMode: 'auto',
    budgetPct: 0.5,
    dayWindowDays: 7,
    toolActivity: null,
  })
}

describe('compose-store', () => {
  beforeEach(reset)

  it('creates a session with a single empty segment', () => {
    useComposeStore.getState().ensureSession(ME_CONTEXT)
    const session = useComposeStore.getState().sessions[ME_CONTEXT]
    expect(session).toBeDefined()
    expect(session.draft.segments).toHaveLength(1)
    expect(session.draft.target).toEqual({ kind: 'original' })
  })

  it('ensureSession is idempotent', () => {
    const s = useComposeStore.getState()
    s.ensureSession(ME_CONTEXT)
    const first = useComposeStore.getState().sessions[ME_CONTEXT]
    s.ensureSession(ME_CONTEXT)
    expect(useComposeStore.getState().sessions[ME_CONTEXT]).toBe(first)
  })

  it('appends streamed tokens to the last assistant message', () => {
    const s = useComposeStore.getState()
    s.ensureSession(ME_CONTEXT)
    s.addMessage(ME_CONTEXT, { role: 'user', content: 'hi' })
    s.addMessage(ME_CONTEXT, { role: 'assistant', content: '' })
    s.appendToLastAssistant(ME_CONTEXT, 'Hel')
    s.appendToLastAssistant(ME_CONTEXT, 'lo')
    const msgs = useComposeStore.getState().sessions[ME_CONTEXT].messages
    expect(msgs[msgs.length - 1].content).toBe('Hello')
  })

  it('applies a draft patch and bumps updatedAt', () => {
    const s = useComposeStore.getState()
    s.ensureSession(ME_CONTEXT)
    const before = useComposeStore.getState().sessions[ME_CONTEXT].draft.updatedAt
    s.applyDraftPatch(ME_CONTEXT, { segments: [{ id: 'x', text: 'new', media: [] }] })
    const draft = useComposeStore.getState().sessions[ME_CONTEXT].draft
    expect(draft.segments[0].text).toBe('new')
    expect(draft.updatedAt >= before).toBe(true)
  })

  it('adds, edits, moves and removes segments', () => {
    const s = useComposeStore.getState()
    s.ensureSession(ME_CONTEXT)
    const firstId = useComposeStore.getState().sessions[ME_CONTEXT].draft.segments[0].id
    s.setSegmentText(ME_CONTEXT, firstId, 'one')
    s.addSegment(ME_CONTEXT)
    let segs = useComposeStore.getState().sessions[ME_CONTEXT].draft.segments
    expect(segs).toHaveLength(2)
    const secondId = segs[1].id
    s.setSegmentText(ME_CONTEXT, secondId, 'two')
    s.moveSegment(ME_CONTEXT, secondId, -1)
    segs = useComposeStore.getState().sessions[ME_CONTEXT].draft.segments
    expect(segs.map((x) => x.text)).toEqual(['two', 'one'])
    s.removeSegment(ME_CONTEXT, segs[0].id)
    expect(useComposeStore.getState().sessions[ME_CONTEXT].draft.segments).toHaveLength(1)
  })

  it('never removes the last remaining segment', () => {
    const s = useComposeStore.getState()
    s.ensureSession(ME_CONTEXT)
    const id = useComposeStore.getState().sessions[ME_CONTEXT].draft.segments[0].id
    s.removeSegment(ME_CONTEXT, id)
    expect(useComposeStore.getState().sessions[ME_CONTEXT].draft.segments).toHaveLength(1)
  })

  it('setLastAssistantContent replaces the streamed text (block-strip case)', () => {
    const s = useComposeStore.getState()
    s.ensureSession(ME_CONTEXT)
    s.addMessage(ME_CONTEXT, { role: 'assistant', content: 'raw with block' })
    s.setLastAssistantContent(ME_CONTEXT, 'clean prose')
    const msgs = useComposeStore.getState().sessions[ME_CONTEXT].messages
    expect(msgs[msgs.length - 1].content).toBe('clean prose')
  })

  it('defaults library mode, budget, and day window', () => {
    const s = useComposeStore.getState()
    expect(s.libraryMode).toBe('auto')
    expect(s.budgetPct).toBe(0.5)
    expect(s.dayWindowDays).toBe(7)
    expect(s.toolActivity).toBeNull()
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
})
