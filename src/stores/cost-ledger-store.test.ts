import { beforeEach, describe, expect, it } from 'vitest'
import { useCostLedgerStore } from './cost-ledger-store'

describe('useCostLedgerStore', () => {
  beforeEach(() => {
    useCostLedgerStore.setState({
      entries: [],
      session: { x: 0, venice: 0 },
      lifetime: { x: 0, venice: 0 },
    })
  })

  it('records a cost and accumulates session + lifetime by provider', () => {
    useCostLedgerStore.getState().recordCost({
      provider: 'x',
      kind: 'posts',
      units: 200,
      unitPriceUsd: 0.005,
    })
    const s = useCostLedgerStore.getState()
    expect(s.session.x).toBeCloseTo(1)
    expect(s.lifetime.x).toBeCloseTo(1)
    expect(s.session.venice).toBe(0)
    expect(s.entries).toHaveLength(1)
  })

  it('ignores zero-cost entries (no window/total mutation)', () => {
    useCostLedgerStore.getState().recordCost({
      provider: 'x',
      kind: 'posts',
      units: 0,
      unitPriceUsd: 0.005,
    })
    const s = useCostLedgerStore.getState()
    expect(s.entries).toHaveLength(0)
    expect(s.session.x).toBe(0)
  })

  it('combines provider totals via sessionTotal/lifetimeTotal', () => {
    const { recordCost } = useCostLedgerStore.getState()
    recordCost({ provider: 'x', kind: 'posts', units: 100, unitPriceUsd: 0.005 }) // 0.5
    recordCost({ provider: 'venice', kind: 'text', units: 1, unitPriceUsd: 0, rawUsd: 0.25 })
    const s = useCostLedgerStore.getState()
    expect(s.sessionTotal('x')).toBeCloseTo(0.5)
    expect(s.sessionTotal('venice')).toBeCloseTo(0.25)
    expect(s.sessionTotal()).toBeCloseTo(0.75)
    expect(s.lifetimeTotal()).toBeCloseTo(0.75)
  })

  it('groups entries by action', () => {
    const { recordCost } = useCostLedgerStore.getState()
    recordCost({ action: 'report:bob', provider: 'x', kind: 'posts', units: 10, unitPriceUsd: 0.005 })
    recordCost({ action: 'report:bob', provider: 'venice', kind: 'text', units: 1, unitPriceUsd: 0, rawUsd: 0.1 })
    const actions = useCostLedgerStore.getState().actions()
    expect(actions).toHaveLength(1)
    expect(actions[0].totalUsd).toBeCloseTo(0.15)
  })

  it('prunes entries older than 30 days when recording', () => {
    const oldTs = Date.now() - 40 * 24 * 60 * 60 * 1000
    useCostLedgerStore.setState({
      entries: [
        {
          id: 'old',
          provider: 'x',
          kind: 'posts',
          units: 1,
          unitPriceUsd: 0.005,
          rawUsd: 0.005,
          ts: oldTs,
        },
      ],
    })
    useCostLedgerStore.getState().recordCost({
      provider: 'x',
      kind: 'posts',
      units: 10,
      unitPriceUsd: 0.005,
    })
    const entries = useCostLedgerStore.getState().entries
    expect(entries.every((e) => e.id !== 'old')).toBe(true)
    expect(entries).toHaveLength(1)
  })
})
