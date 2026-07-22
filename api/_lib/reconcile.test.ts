import { describe, it, expect } from 'vitest'
import { computeTrueFactors } from './reconcile'

describe('computeTrueFactors', () => {
  it('returns actual/estimated per provider', () => {
    const f = computeTrueFactors({ venice: 1, x: 2 }, { venice: 0.7, x: 1.4 })
    expect(f.venice).toBeCloseTo(0.7)
    expect(f.x).toBeCloseTo(0.7)
  })

  it('factor < 1 confirms conservative estimates (healthy margin)', () => {
    const f = computeTrueFactors({ venice: 10, x: 0 }, { venice: 6, x: null })
    expect(f.venice).toBeCloseTo(0.6)
    expect(f.venice! < 1).toBe(true)
  })

  it('factor > 1 flags under-charging', () => {
    const f = computeTrueFactors({ venice: 10, x: 0 }, { venice: 12, x: null })
    expect(f.venice).toBeCloseTo(1.2)
  })

  it('null venice when no estimate basis', () => {
    const f = computeTrueFactors({ venice: 0, x: 5 }, { venice: 3, x: 4 })
    expect(f.venice).toBeNull()
    expect(f.x).toBeCloseTo(0.8)
  })

  it('null x when actual unavailable', () => {
    const f = computeTrueFactors({ venice: 1, x: 5 }, { venice: 1, x: null })
    expect(f.x).toBeNull()
  })
})
