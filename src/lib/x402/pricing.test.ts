import { describe, it, expect } from 'vitest'
import { buildPreview, chargedPrice, estimateChargedFromRaw } from './pricing'
import { X402_MARGIN, usdToUsdcBaseUnits, usdcBaseUnitsToUsd, applyMargin } from './config'
import type { CostEntry } from '../cost/ledger'

function entry(partial: Partial<CostEntry>): CostEntry {
  return {
    id: Math.random().toString(36).slice(2),
    provider: 'x',
    kind: 'posts',
    units: 1,
    unitPriceUsd: 0.005,
    rawUsd: 0.005,
    ts: Date.now(),
    ...partial,
  }
}

describe('config money helpers', () => {
  it('applies the margin multiplier', () => {
    expect(applyMargin(1)).toBeCloseTo(X402_MARGIN)
    expect(applyMargin(0)).toBe(0)
    expect(applyMargin(-5)).toBe(0)
  })

  it('converts USD to USDC base units (6 decimals)', () => {
    expect(usdToUsdcBaseUnits(1)).toBe('1000000')
    expect(usdToUsdcBaseUnits(0.005)).toBe('5000')
    expect(usdToUsdcBaseUnits(0)).toBe('0')
  })

  it('round-trips USDC base units back to USD', () => {
    expect(usdcBaseUnitsToUsd('1000000')).toBeCloseTo(1)
    expect(usdcBaseUnitsToUsd('5000')).toBeCloseTo(0.005)
    expect(usdcBaseUnitsToUsd('nonsense')).toBe(0)
  })
})

describe('chargedPrice', () => {
  it('multiplies raw by margin', () => {
    expect(chargedPrice(2)).toBeCloseTo(2 * X402_MARGIN)
    expect(estimateChargedFromRaw(2)).toBeCloseTo(2 * X402_MARGIN)
  })
  it('is zero for non-positive raw', () => {
    expect(chargedPrice(0)).toBe(0)
    expect(chargedPrice(-1)).toBe(0)
  })
})

describe('buildPreview', () => {
  it('aggregates entries by provider:kind and applies margin', () => {
    const preview = buildPreview([
      entry({ provider: 'x', kind: 'posts', units: 10, rawUsd: 0.05 }),
      entry({ provider: 'x', kind: 'posts', units: 5, rawUsd: 0.025 }),
      entry({ provider: 'venice', kind: 'text', units: 1000, rawUsd: 0.02 }),
    ])
    expect(preview.lines).toHaveLength(2)
    const posts = preview.lines.find((l) => l.kind === 'posts')!
    expect(posts.units).toBe(15)
    expect(posts.rawUsd).toBeCloseTo(0.075)
    expect(posts.chargedUsd).toBeCloseTo(0.075 * X402_MARGIN)
    expect(preview.rawUsd).toBeCloseTo(0.095)
    expect(preview.chargedUsd).toBeCloseTo(0.095 * X402_MARGIN)
    expect(preview.margin).toBe(X402_MARGIN)
  })

  it('returns empty totals for no entries', () => {
    const preview = buildPreview([])
    expect(preview.lines).toEqual([])
    expect(preview.rawUsd).toBe(0)
    expect(preview.chargedUsd).toBe(0)
  })
})
