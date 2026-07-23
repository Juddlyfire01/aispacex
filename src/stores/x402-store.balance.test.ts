import { beforeEach, describe, expect, it } from 'vitest'
import { coerceBalanceUsd, useX402Store } from './x402-store'

describe('coerceBalanceUsd', () => {
  it('passes through normal dollar amounts', () => {
    expect(coerceBalanceUsd(1.919)).toBeCloseTo(1.919)
    expect(coerceBalanceUsd(5)).toBe(5)
    expect(coerceBalanceUsd(0)).toBe(0)
  })

  it('coerces numeric strings (JSON edge cases)', () => {
    expect(coerceBalanceUsd('8.75')).toBeCloseTo(8.75)
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

describe('applyTopUp', () => {
  beforeEach(() => {
    useX402Store.setState({
      balanceUsd: 3.5,
      ledger: [],
      sessionChargedUsd: 0,
    })
  })

  it('replaces with server total (leftover + credit), not local+credit', () => {
    // Stale local 3.5; Redis leftover was 1.0 so after $5 top-up server says 6.0
    useX402Store.getState().applyTopUp(5, 6)
    expect(useX402Store.getState().balanceUsd).toBeCloseTo(6)
  })

  it('accepts string server totals', () => {
    useX402Store.getState().applyTopUp(5, '8.75' as unknown as number)
    expect(useX402Store.getState().balanceUsd).toBeCloseTo(8.75)
  })
})
