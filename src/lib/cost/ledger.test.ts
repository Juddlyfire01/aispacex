import { describe, it, expect } from 'vitest'
import { makeEntry, groupByAction, sumUsd } from './ledger'

describe('makeEntry', () => {
  it('computes rawUsd from units * unitPriceUsd by default', () => {
    const e = makeEntry({ provider: 'x', kind: 'posts', units: 200, unitPriceUsd: 0.005 })
    expect(e.rawUsd).toBeCloseTo(1)
    expect(e.provider).toBe('x')
    expect(e.id).toBeTruthy()
  })

  it('honors an explicit rawUsd override', () => {
    const e = makeEntry({ provider: 'venice', kind: 'text', units: 1234, unitPriceUsd: 0, rawUsd: 0.42 })
    expect(e.rawUsd).toBeCloseTo(0.42)
  })

  it('clamps negatives to zero', () => {
    const e = makeEntry({ provider: 'x', kind: 'posts', units: -5, unitPriceUsd: -1 })
    expect(e.units).toBe(0)
    expect(e.unitPriceUsd).toBe(0)
    expect(e.rawUsd).toBe(0)
  })
})

describe('groupByAction', () => {
  it('groups entries and sums per provider', () => {
    const entries = [
      makeEntry({ action: 'report:alice', provider: 'x', kind: 'posts', units: 100, unitPriceUsd: 0.005 }),
      makeEntry({ action: 'report:alice', provider: 'x', kind: 'users', units: 1, unitPriceUsd: 0.01 }),
      makeEntry({ action: 'report:alice', provider: 'venice', kind: 'text', units: 1000, unitPriceUsd: 0, rawUsd: 0.3 }),
    ]
    const groups = groupByAction(entries)
    expect(groups).toHaveLength(1)
    const g = groups[0]
    expect(g.action).toBe('report:alice')
    expect(g.byProvider.x).toBeCloseTo(0.51)
    expect(g.byProvider.venice).toBeCloseTo(0.3)
    expect(g.totalUsd).toBeCloseTo(0.81)
  })

  it('buckets entries without an action under "unassigned"', () => {
    const groups = groupByAction([makeEntry({ provider: 'x', kind: 'posts', units: 1, unitPriceUsd: 0.005 })])
    expect(groups[0].action).toBe('unassigned')
  })
})

describe('sumUsd', () => {
  const entries = [
    makeEntry({ provider: 'x', kind: 'posts', units: 100, unitPriceUsd: 0.005 }),
    makeEntry({ provider: 'venice', kind: 'text', units: 1, unitPriceUsd: 0, rawUsd: 0.25 }),
  ]
  it('sums all providers', () => {
    expect(sumUsd(entries)).toBeCloseTo(0.75)
  })
  it('filters by provider', () => {
    expect(sumUsd(entries, 'x')).toBeCloseTo(0.5)
    expect(sumUsd(entries, 'venice')).toBeCloseTo(0.25)
  })
})
