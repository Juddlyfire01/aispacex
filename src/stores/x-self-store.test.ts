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
})
