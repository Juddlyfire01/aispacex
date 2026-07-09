import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  resolveContextLimit,
  computeHotBudget,
  DEFAULT_CONTEXT_FALLBACK,
  DEFAULT_BUDGET_PCT,
} from './token-estimate'
import type { VeniceModel } from '../../types/venice'

describe('estimateTokens', () => {
  it('uses ceil(chars/4)', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })
})

describe('resolveContextLimit', () => {
  it('reads availableContextTokens from model_spec', () => {
    const m: VeniceModel = {
      id: 'grok-big',
      object: 'model',
      created: 0,
      owned_by: 'x',
      model_spec: { availableContextTokens: 1_000_000 },
    }
    expect(resolveContextLimit(m)).toBe(1_000_000)
  })

  it('falls back when missing', () => {
    expect(resolveContextLimit(undefined)).toBe(DEFAULT_CONTEXT_FALLBACK)
    expect(resolveContextLimit({ id: 'x', object: 'model', created: 0, owned_by: 'v' })).toBe(
      DEFAULT_CONTEXT_FALLBACK,
    )
  })
})

describe('computeHotBudget', () => {
  it('applies pct after reserved overhead', () => {
    // context 100_000, reserved min(8000, 10%) = 8000, usable 92000, 50% => 46000
    expect(computeHotBudget(100_000, 0.5)).toBe(46_000)
  })

  it('clamps budgetPct to 0.25–0.75', () => {
    const low = computeHotBudget(100_000, 0.1)
    const high = computeHotBudget(100_000, 0.9)
    expect(low).toBe(computeHotBudget(100_000, 0.25))
    expect(high).toBe(computeHotBudget(100_000, 0.75))
  })
})
