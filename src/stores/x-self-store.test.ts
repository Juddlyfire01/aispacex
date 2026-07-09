import { describe, it, expect, beforeEach } from 'vitest'
import { useXSelfStore } from './x-self-store'

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
    })
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
})
