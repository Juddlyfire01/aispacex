import { describe, expect, it } from 'vitest'
import { buildCraftInject, CRAFT_CADENCE } from './index'

describe('CRAFT cadence guidance', () => {
  it('exports CADENCE with volume, spacing, windows, and sweet spots', () => {
    expect(CRAFT_CADENCE).toMatch(/1–2 original posts\/day/)
    expect(CRAFT_CADENCE).toMatch(/≥4 hours/)
    expect(CRAFT_CADENCE).toMatch(/~30 minutes/)
    expect(CRAFT_CADENCE).toMatch(/~200–280/)
    expect(CRAFT_CADENCE).toMatch(/WHEN ADVISING THE USER/)
  })

  it('includes cadence inside buildCraftInject', () => {
    const inject = buildCraftInject()
    expect(inject).toMatch(/CADENCE & TIMING/)
    expect(inject).toMatch(/DRAFT SWEET SPOTS/)
    expect(inject).toMatch(/Cadence OK/)
  })
})
