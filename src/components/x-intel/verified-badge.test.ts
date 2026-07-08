import { describe, it, expect } from 'vitest'
import { VERIFIED_BADGE_COLORS } from './verified-badge'

describe('VERIFIED_BADGE_COLORS', () => {
  it('matches X official badge fills from Wikimedia SVG sources', () => {
    expect(VERIFIED_BADGE_COLORS.blue).toBe('#1d9bf0')
    expect(VERIFIED_BADGE_COLORS.business).toBe('#e2b719')
    expect(VERIFIED_BADGE_COLORS.government).toBe('#829aab')
  })
})
