import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../x402/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../x402/config')>()
  return { ...actual, X402_PASS_X_DEDUP: true }
})

import { billableXUnits, utcDayKey, useXDedupBillingStore } from './x-dedup-billing'

describe('billableXUnits (pass-dedup on)', () => {
  beforeEach(() => {
    useXDedupBillingStore.setState({
      day: utcDayKey(),
      seen: { posts: [], users: [], likes: [] },
    })
  })

  it('bills new ids once, then zero on repeat', () => {
    expect(billableXUnits('posts', ['a', 'b', 'c'], 3)).toBe(3)
    expect(billableXUnits('posts', ['a', 'b', 'c'], 3)).toBe(0)
    expect(billableXUnits('posts', ['a', 'b', 'd'], 3)).toBe(1)
  })

  it('dedupes within a single claim', () => {
    expect(billableXUnits('users', ['u1', 'u1', 'u2'], 2)).toBe(2)
  })

  it('adds conservative missing units when result_count exceeds returned ids', () => {
    expect(billableXUnits('posts', ['a'], 5)).toBe(1 + 4)
  })

  it('resets when the UTC day rolls', () => {
    expect(billableXUnits('posts', ['a'], 1)).toBe(1)
    useXDedupBillingStore.setState({ day: '2000-01-01' })
    expect(billableXUnits('posts', ['a'], 1)).toBe(1)
  })
})
