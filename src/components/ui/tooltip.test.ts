import { describe, expect, it } from 'vitest'
import { hasTooltipTip } from './tooltip-tip'

describe('hasTooltipTip', () => {
  it('skips when tip is missing or blank', () => {
    expect(hasTooltipTip(undefined)).toBe(false)
    expect(hasTooltipTip('')).toBe(false)
    expect(hasTooltipTip('   ')).toBe(false)
  })

  it('attaches when tip text is present', () => {
    expect(hasTooltipTip('Share of circulating VVV locked in staking.')).toBe(true)
  })
})
