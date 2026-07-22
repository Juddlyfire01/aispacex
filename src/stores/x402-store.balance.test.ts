import { describe, expect, it } from 'vitest'
import { coerceBalanceUsd } from './x402-store'

describe('coerceBalanceUsd', () => {
  it('passes through normal dollar amounts', () => {
    expect(coerceBalanceUsd(1.919)).toBeCloseTo(1.919)
    expect(coerceBalanceUsd(5)).toBe(5)
    expect(coerceBalanceUsd(0)).toBe(0)
  })

  it('converts integer micro-USD leftovers from the read bug', () => {
    expect(coerceBalanceUsd(1_919_000)).toBeCloseTo(1.919)
    expect(coerceBalanceUsd(5_000_000)).toBe(5)
  })

  it('rejects non-finite / negative', () => {
    expect(coerceBalanceUsd(Number.NaN)).toBe(0)
    expect(coerceBalanceUsd(-3)).toBe(0)
  })
})
