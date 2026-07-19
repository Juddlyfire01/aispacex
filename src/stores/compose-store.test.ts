import { describe, it, expect, beforeEach } from 'vitest'
import { useComposeStore, migrateComposeState, ME_CONTEXT } from './compose-store'
import {
  extractComposePrefsSeed,
  markComposePrefsMigrationDone,
  migratePostSubTab,
  useComposePrefsStore,
} from './compose-prefs-store'
import {
  clearPendingComposePrefsSeed,
  peekPendingComposePrefsSeed,
  setPendingComposePrefsSeed,
} from '../lib/compose/compose-prefs-seed'
import { emptyDraft } from '../lib/compose/types'
import { DRAFT_MODEL_SAME } from '../lib/compose/draft-writer-tool'

function reset() {
  clearPendingComposePrefsSeed()
  useComposeStore.setState({
    threads: {},
    threadOrder: [],
    activeThreadId: null,
    isStreaming: false,
    toolActivity: null,
  })
  useComposePrefsStore.setState({
    model: '',
    modelLabel: '',
    draftModel: DRAFT_MODEL_SAME,
    xSearch: 'auto',
    webSearch: 'auto',
    xNewsOn: true,
    xNewsMaxAgeHours: 24,
    longformPreference: true,
    libraryMode: 'auto',
    budgetPct: 0.5,
    dayWindowDays: 7,
    draftDrawerOpen: false,
    draftDrawerWidthPct: 50,
    activePostSubTab: 'composer',
    newThreadContext: { type: 'all' },
    migratedFromCompose: false,
  })
  // Tests call setters/apply without a real persist hydrate.
  Object.defineProperty(useComposePrefsStore.persist, 'hasHydrated', {
    configurable: true,
    value: () => true,
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

  it('setLastAssistantContent replaces the streamed text (block-strip case)', () => {
    const s = useComposeStore.getState()
    const id = s.createThread()
    s.addMessage(id, { role: 'assistant', content: 'raw with block' })
    s.setLastAssistantContent(id, 'clean prose')
    const msgs = useComposeStore.getState().threads[id].messages
    expect(msgs[msgs.length - 1].content).toBe('clean prose')
  })

  it('defaults tool activity null; prefs live on compose-prefs store', () => {
    expect(useComposeStore.getState().toolActivity).toBeNull()
    expect(useComposePrefsStore.getState().libraryMode).toBe('auto')
    expect(useComposePrefsStore.getState().budgetPct).toBe(0.5)
    expect(useComposePrefsStore.getState().dayWindowDays).toBe(7)
    expect(useComposePrefsStore.getState().newThreadContext).toEqual({ type: 'all' })
  })

  it('sets tool activity on compose store', () => {
    const s = useComposeStore.getState()
    s.setToolActivity('Searching library…')
    expect(useComposeStore.getState().toolActivity).toBe('Searching library…')
    s.setToolActivity(null)
    expect(useComposeStore.getState().toolActivity).toBeNull()
  })

  it('migrateComposeState version < 9 no longer keeps a top-level preferredFormat', () => {
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
    expect(
      (migrated as unknown as Record<string, unknown>).preferredFormat,
    ).toBeUndefined()
  })

  it('migrateComposeState version < 15 resets preferredFormat to auto (not persisted)', () => {
    const migrated = migrateComposeState(
      {
        threads: {},
        threadOrder: [],
        activeThreadId: null,
        model: 'grok',
        draftModel: 'same',
        preferredFormat: 'longform',
      },
      14,
    )
    expect(
      (migrated as unknown as Record<string, unknown>).preferredFormat,
    ).toBeUndefined()
  })

  it('migrateComposeState version < 16 moves preferredFormat onto each thread', () => {
    const migrated = migrateComposeState(
      {
        threads: {
          t1: { id: 't1', messages: [], draft: {} },
          t2: { id: 't2', messages: [], draft: {}, preferredFormat: 'longform' },
        },
        threadOrder: ['t1', 't2'],
        activeThreadId: 't1',
        model: 'grok',
        draftModel: 'same',
        preferredFormat: 'article',
      },
      15,
    )
    expect(
      (migrated as unknown as Record<string, unknown>).preferredFormat,
    ).toBeUndefined()
    expect(migrated.threads.t1?.preferredFormat).toBe('auto')
    expect(migrated.threads.t2?.preferredFormat).toBe('longform')
  })

  it('setPreferredFormat persists per-thread without touching other threads', () => {
    const s = useComposeStore.getState()
    const a = s.createThread()
    const b = s.createThread()
    useComposeStore.getState().setPreferredFormat(a, 'longform')
    expect(useComposeStore.getState().threads[a]?.preferredFormat).toBe('longform')
    expect(useComposeStore.getState().threads[b]?.preferredFormat).toBe('auto')
  })

  it('createThread seeds preferredFormat auto', () => {
    const id = useComposeStore.getState().createThread()
    expect(useComposeStore.getState().threads[id]?.preferredFormat).toBe('auto')
  })

  it('migrateComposeState v18 strips prefs and seeds pending prefs snapshot', () => {
    clearPendingComposePrefsSeed()
    const migrated = migrateComposeState(
      {
        threads: {},
        threadOrder: [],
        activeThreadId: null,
        model: 'grok-4-3',
        draftModel: '',
        xSearch: 'on',
        webSearch: 'off',
        xNewsOn: false,
        xNewsMaxAgeHours: 48,
        activePostSubTab: 'alpha',
        newThreadContext: { type: 'me' },
        libraryMode: 'custom',
        budgetPct: 0.6,
        dayWindowDays: 3,
        draftDrawerOpen: true,
        draftDrawerWidthPct: 40,
        longformPreference: false,
      },
      17,
    )
    const raw = migrated as unknown as Record<string, unknown>
    expect(raw.model).toBeUndefined()
    expect(raw.draftModel).toBeUndefined()
    expect(raw.activePostSubTab).toBeUndefined()
    expect(raw.newThreadContext).toBeUndefined()

    const seed = peekPendingComposePrefsSeed()
    expect(seed).not.toBeNull()
    expect(seed?.model).toBe('grok-4-3')
    expect(seed?.draftModel).toBe(DRAFT_MODEL_SAME)
    expect(seed?.xSearch).toBe('on')
    expect(seed?.webSearch).toBe('off')
    expect(seed?.xNewsOn).toBe(false)
    expect(seed?.activePostSubTab).toBe('alpha')
    expect(seed?.newThreadContext).toEqual({ type: 'me' })
    expect(seed?.libraryMode).toBe('custom')
    expect(seed?.budgetPct).toBe(0.6)
    expect(seed?.draftDrawerOpen).toBe(true)
  })

  it('migrateComposeState maps legacy profile/feed/network Post ids into seed', () => {
    clearPendingComposePrefsSeed()
    migrateComposeState({ activePostSubTab: 'profile' }, 16)
    expect(peekPendingComposePrefsSeed()?.activePostSubTab).toBe('composer')
    clearPendingComposePrefsSeed()
    migrateComposeState({ activePostSubTab: 'feed' }, 16)
    expect(peekPendingComposePrefsSeed()?.activePostSubTab).toBe('performance')
    clearPendingComposePrefsSeed()
    migrateComposeState({ activePostSubTab: 'network' }, 16)
    expect(peekPendingComposePrefsSeed()?.activePostSubTab).toBe('alpha')
  })

  it('migrateComposeState v3 sessions → v4 threads', () => {
    clearPendingComposePrefsSeed()
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
    const firstId = migrated.threadOrder[0]
    expect(migrated.threads[firstId].context).toEqual({ type: 'target', username: 'AskVenice' })
    expect(migrated.activeThreadId).toBe(firstId)
    expect(peekPendingComposePrefsSeed()?.newThreadContext).toEqual({
      type: 'target',
      username: 'AskVenice',
    })
    const meThread = Object.values(migrated.threads).find((t) => t.context.type === 'me')
    expect(meThread?.title).toBe('Hello from me')
  })
})

describe('compose-prefs-store', () => {
  beforeEach(reset)

  it('clamps budgetPct to 0.25–0.75', () => {
    const s = useComposePrefsStore.getState()
    s.setBudgetPct(0.1)
    expect(useComposePrefsStore.getState().budgetPct).toBe(0.25)
    s.setBudgetPct(0.9)
    expect(useComposePrefsStore.getState().budgetPct).toBe(0.75)
    s.setBudgetPct(0.6)
    expect(useComposePrefsStore.getState().budgetPct).toBe(0.6)
  })

  it('sets library mode, day window, and post sub-tab', () => {
    const s = useComposePrefsStore.getState()
    s.setLibraryMode('custom')
    s.setDayWindowDays(null)
    s.setActivePostSubTab('performance')
    expect(useComposePrefsStore.getState().libraryMode).toBe('custom')
    expect(useComposePrefsStore.getState().dayWindowDays).toBeNull()
    expect(useComposePrefsStore.getState().activePostSubTab).toBe('performance')
    s.setActivePostSubTab('composer')
    expect(useComposePrefsStore.getState().activePostSubTab).toBe('composer')
    s.setActivePostSubTab('alpha')
    expect(useComposePrefsStore.getState().activePostSubTab).toBe('alpha')
  })

  it('migratePostSubTab maps legacy ids', () => {
    expect(migratePostSubTab('profile')).toBe('composer')
    expect(migratePostSubTab('feed')).toBe('performance')
    expect(migratePostSubTab('network')).toBe('alpha')
    expect(migratePostSubTab('composer')).toBe('composer')
  })

  it('markComposePrefsMigrationDone applies pending seed once', () => {
    setPendingComposePrefsSeed(
      extractComposePrefsSeed({
        model: 'grok-user',
        draftModel: 'venice-uncensored-1-2',
        xSearch: 'on',
        activePostSubTab: 'alpha',
      }),
    )
    markComposePrefsMigrationDone()
    expect(useComposePrefsStore.getState().model).toBe('grok-user')
    expect(useComposePrefsStore.getState().draftModel).toBe('venice-uncensored-1-2')
    expect(useComposePrefsStore.getState().xSearch).toBe('on')
    expect(useComposePrefsStore.getState().activePostSubTab).toBe('alpha')
    expect(useComposePrefsStore.getState().migratedFromCompose).toBe(true)
    expect(peekPendingComposePrefsSeed()).toBeNull()

    // Second call must not overwrite user changes.
    useComposePrefsStore.getState().setModel('kept')
    setPendingComposePrefsSeed(
      extractComposePrefsSeed({ model: 'should-not-apply' }),
    )
    markComposePrefsMigrationDone()
    expect(useComposePrefsStore.getState().model).toBe('kept')
  })

  it('createThread reads newThreadContext from prefs store', () => {
    useComposePrefsStore.getState().setNewThreadContext({ type: 'target', username: 'venice' })
    const id = useComposeStore.getState().createThread()
    expect(useComposeStore.getState().threads[id].context).toEqual({
      type: 'target',
      username: 'venice',
    })
  })
})
