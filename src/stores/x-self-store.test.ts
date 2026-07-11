import { describe, it, expect, beforeEach } from 'vitest'
import { useXSelfStore } from './x-self-store'
import { DEFAULT_SYNTHESIS_SETTINGS, MAX_CONTEXT_CAP } from '../lib/x-intel/types'

describe('useXSelfStore reorderAccounts', () => {
  beforeEach(() => {
    useXSelfStore.setState({
      accounts: {},
      accountOrder: [],
      activeAccountId: null,
      connecting: false,
      connected: false,
      generatingReports: {},
      reportGenerateErrors: {},
      gatheringAccounts: {},
      defaultSynthesisSettings: { ...DEFAULT_SYNTHESIS_SETTINGS },
    })
  })

  it('upsertAccount seeds synthesis contextCap at MAX', () => {
    useXSelfStore.getState().upsertAccount({ id: '1', username: 'alice' })
    expect(useXSelfStore.getState().accounts['1'].synthesisSettings.contextCap).toBe(MAX_CONTEXT_CAP)
  })

  it('appendReport grows includedReportIds when report context was at MAX', () => {
    const store = useXSelfStore.getState()
    store.upsertAccount({ id: '1', username: 'alice' })
    store.appendReport('1', {
      id: 'a',
      createdAt: '2026-07-01T00:00:00.000Z',
      model: 'test',
      synthesisSettings: { ...DEFAULT_SYNTHESIS_SETTINGS },
      meta: { postCount: 1, dateRange: null, postIdsAnalyzed: [], tokenCost: 0 },
      analytics: {} as never,
      narrative: {} as never,
      changeSummary: null,
      previousReportId: null,
    })
    expect(useXSelfStore.getState().accounts['1'].synthesisSettings.includedReportIds).toEqual(['a'])
    store.appendReport('1', {
      id: 'b',
      createdAt: '2026-07-02T00:00:00.000Z',
      model: 'test',
      synthesisSettings: { ...DEFAULT_SYNTHESIS_SETTINGS },
      meta: { postCount: 1, dateRange: null, postIdsAnalyzed: [], tokenCost: 0 },
      analytics: {} as never,
      narrative: {} as never,
      changeSummary: null,
      previousReportId: 'a',
    })
    expect(useXSelfStore.getState().accounts['1'].synthesisSettings.includedReportIds).toEqual(['b', 'a'])
  })

  it('reorders connected accounts without changing the active account', () => {
    const store = useXSelfStore.getState()
    store.upsertAccount({ id: '1', username: 'alice' })
    store.upsertAccount({ id: '2', username: 'bob' })
    store.upsertAccount({ id: '3', username: 'carol' })
    store.setActiveAccount('2')
    store.reorderAccounts(0, 2)
    const s = useXSelfStore.getState()
    expect(s.accountOrder).toEqual(['2', '3', '1'])
    expect(s.activeAccountId).toBe('2')
  })

  it('is a no-op for out-of-bounds indexes', () => {
    const store = useXSelfStore.getState()
    store.upsertAccount({ id: '1', username: 'alice' })
    store.upsertAccount({ id: '2', username: 'bob' })
    store.reorderAccounts(1, 5)
    expect(useXSelfStore.getState().accountOrder).toEqual(['1', '2'])
  })

  it('setReportGenerating / setReportGenerateError track per-account job state', () => {
    const store = useXSelfStore.getState()
    store.upsertAccount({ id: '1', username: 'alice' })
    store.setReportGenerating('1', true)
    store.setReportGenerateError('1', 'failed')
    expect(useXSelfStore.getState().generatingReports['1']).toBe(true)
    expect(useXSelfStore.getState().reportGenerateErrors['1']).toBe('failed')
    store.setReportGenerating('1', false)
    store.setReportGenerateError('1', null)
    expect(useXSelfStore.getState().generatingReports['1']).toBeUndefined()
    expect(useXSelfStore.getState().reportGenerateErrors['1']).toBeUndefined()
  })

  it('setGathering tracks ephemeral per-account gather state', () => {
    const store = useXSelfStore.getState()
    store.upsertAccount({ id: '1', username: 'alice' })
    store.setGathering('1', true)
    expect(useXSelfStore.getState().gatheringAccounts['1']).toBe(true)
    store.setGathering('1', false)
    expect(useXSelfStore.getState().gatheringAccounts['1']).toBeUndefined()
  })
})
