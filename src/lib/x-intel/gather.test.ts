import { describe, it, expect } from 'vitest'
import { estimateCost, billableCount } from './gather'

describe('estimateCost', () => {
  it('prices posts at $0.005 each', () => {
    expect(estimateCost('posts', 50)).toBeCloseTo(0.25)
  })
  it('prices users at $0.01 each', () => {
    expect(estimateCost('users', 7)).toBeCloseTo(0.07)
  })
  it('prices likes at $0.001 each', () => {
    expect(estimateCost('likes', 100)).toBeCloseTo(0.1)
  })
})

describe('billableCount', () => {
  it('prefers meta.result_count when present', () => {
    expect(billableCount({ result_count: 42 }, 40)).toBe(42)
  })
  it('prefers result_count even when it differs from array length', () => {
    // X charges per resource RETURNED; result_count is authoritative.
    expect(billableCount({ result_count: 0 }, 5)).toBe(0)
  })
  it('falls back to array length when meta missing', () => {
    expect(billableCount(undefined, 12)).toBe(12)
  })
  it('falls back to array length when result_count is not a number', () => {
    expect(billableCount({} as { result_count?: number }, 8)).toBe(8)
  })
  it('never returns negative', () => {
    expect(billableCount(undefined, -3)).toBe(0)
  })
})
