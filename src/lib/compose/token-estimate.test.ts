import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  resolveContextLimit,
  computeHotBudget,
  estimateComposeContextPct,
  estimateComposeContextBreakdown,
  COMPLETION_RESERVE,
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

describe('estimateComposeContextPct', () => {
  it('scales with messages and completion reserve', () => {
    const pct = estimateComposeContextPct({
      system: 'abcd',
      messages: [{ content: 'efgh' }],
      contextLimit: COMPLETION_RESERVE * 2,
    })
    expect(pct).toBeGreaterThan(0.5)
    expect(pct).toBeLessThanOrEqual(1)
  })

  it('folds hot text into a pending user turn', () => {
    const without = estimateComposeContextPct({
      system: 'sys',
      messages: [],
      pendingUserText: 'hi',
      contextLimit: 50_000,
    })
    const withHot = estimateComposeContextPct({
      system: 'sys',
      messages: [],
      pendingUserText: 'hi',
      hotText: 'x'.repeat(4_000),
      contextLimit: 50_000,
    })
    expect(withHot).toBeGreaterThan(without)
  })
})

describe('estimateComposeContextBreakdown', () => {
  it('splits system, tools, hot, conversation, and reserve', () => {
    const b = estimateComposeContextBreakdown({
      system: 'sys'.repeat(50),
      messages: [{ role: 'user', content: 'hello world' }],
      pendingUserText: 'next',
      hotText: 'HOT'.repeat(100),
      toolsJson: '{"tools":[]}',
      contextLimit: 100_000,
      coldArchiveCount: 2,
    })
    expect(b.segments.map((s) => s.id)).toEqual([
      'system',
      'tools',
      'hot',
      'conversation',
      'reserve',
    ])
    expect(b.coldArchiveCount).toBe(2)
    expect(b.usedTokens).toBe(b.segments.reduce((n, s) => n + s.tokens, 0))
  })

  it('prefers hotTokens over re-estimating hotText', () => {
    const b = estimateComposeContextBreakdown({
      system: 'sys',
      messages: [],
      hotText: 'x'.repeat(40_000),
      hotTokens: 12_500,
      contextLimit: 100_000,
    })
    expect(b.segments.find((s) => s.id === 'hot')?.tokens).toBe(12_500)
  })
})
