import { describe, it, expect } from 'vitest'
import { usdToUsdcBaseUnits, usdcBaseUnitsToUsd } from './config'

describe('usdToUsdcBaseUnits', () => {
  it('encodes dollars to 6-decimal base units', () => {
    expect(usdToUsdcBaseUnits(5)).toBe('5000000')
    expect(usdToUsdcBaseUnits(25)).toBe('25000000')
    expect(usdToUsdcBaseUnits(0.01)).toBe('10000')
  })

  it('round-trips with usdcBaseUnitsToUsd', () => {
    const units = usdToUsdcBaseUnits(12.5)
    expect(usdcBaseUnitsToUsd(units)).toBeCloseTo(12.5)
  })
})
