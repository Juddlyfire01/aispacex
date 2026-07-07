import { describe, it, expect } from 'vitest'
import { estimateCost } from './gather'

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
