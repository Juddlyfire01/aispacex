import { beforeEach, describe, expect, it } from 'vitest'
import { useVeniceCostStore } from './venice-cost-store'
import type { VeniceModel } from '../types/venice'

const priced: VeniceModel = {
  id: 'm',
  object: 'model',
  created: 0,
  owned_by: 'v',
  model_spec: { pricing: { input: { usd: 1 }, output: { usd: 2 } } },
}

describe('useVeniceCostStore', () => {
  beforeEach(() => {
    useVeniceCostStore.setState({ sessionCost: 0, lifetimeTotal: 0 })
  })

  it('addUsage accumulates session and lifetime', () => {
    useVeniceCostStore.getState().addUsage(priced, {
      prompt_tokens: 1_000_000,
      completion_tokens: 500_000,
    })
    // 1*1 + 0.5*2 = 2
    const s = useVeniceCostStore.getState()
    expect(s.sessionCost).toBeCloseTo(2)
    expect(s.lifetimeTotal).toBeCloseTo(2)
  })

  it('ignores zero usage', () => {
    useVeniceCostStore.getState().addUsage(priced, { prompt_tokens: 0, completion_tokens: 0 })
    expect(useVeniceCostStore.getState().sessionCost).toBe(0)
  })
})
