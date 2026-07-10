import { describe, it, expect, beforeEach } from 'vitest'
import { clearPackHotWindowCache, packHotWindow, packHotWindowCached } from './hot-window'
import { sampleSnapshot } from '../intel-library/test-fixtures'
import { estimateTokens } from './token-estimate'

const now = new Date('2026-07-09T12:00:00.000Z')

describe('packHotWindow', () => {
  const snap = sampleSnapshot()

  it('Auto stays under budget', () => {
    const result = packHotWindow({
      snapshot: snap,
      scope: { type: 'all' },
      mode: 'auto',
      dayWindowDays: 7,
      tokenBudget: 500,
      now,
    })
    expect(result.overBudget).toBe(false)
    expect(estimateTokens(result.text)).toBeLessThanOrEqual(500)
    expect(result.text).toContain('LOCAL INTEL')
  })

  it('prefers bookmarks and recent staking post over old cats post when budget tight', () => {
    const result = packHotWindow({
      snapshot: snap,
      scope: { type: 'me' },
      mode: 'auto',
      dayWindowDays: 7,
      tokenBudget: 200,
      now,
    })
    expect(result.text).toMatch(/bookmarked|staking/i)
  })

  it('Custom overBudget when day window cannot fit', () => {
    const result = packHotWindow({
      snapshot: snap,
      scope: { type: 'all' },
      mode: 'custom',
      dayWindowDays: 30,
      tokenBudget: 50,
      now,
    })
    expect(result.overBudget).toBe(true)
    expect(result.estimatedTokens).toBeGreaterThan(50)
  })

  it('includes latest report summary when budget allows', () => {
    const result = packHotWindow({
      snapshot: snap,
      scope: { type: 'target', username: 'AskVenice' },
      mode: 'auto',
      dayWindowDays: 7,
      tokenBudget: 5000,
      now,
    })
    expect(result.text).toMatch(/private inference|AskVenice/i)
  })

  it('empty snapshot yields empty or header-only pack with zero counts', () => {
    const result = packHotWindow({
      snapshot: { subjects: [] },
      scope: { type: 'all' },
      mode: 'auto',
      dayWindowDays: 7,
      tokenBudget: 500,
      now,
    })
    expect(result.overBudget).toBe(false)
    expect(result.included).toEqual({ posts: 0, reports: 0, subjects: 0 })
    expect(result.estimatedTokens).toBe(estimateTokens(result.text))
  })
})

describe('packHotWindowCached', () => {
  beforeEach(() => {
    clearPackHotWindowCache()
  })

  it('returns the same object on identical inputs', () => {
    const snap = sampleSnapshot()
    const input = {
      snapshot: snap,
      scope: { type: 'all' as const },
      mode: 'auto' as const,
      dayWindowDays: 7,
      tokenBudget: 500,
      now,
    }
    const a = packHotWindowCached(input)
    const b = packHotWindowCached({ ...input, snapshot: sampleSnapshot() })
    expect(b).toBe(a)
  })

  it('misses when budget changes', () => {
    const snap = sampleSnapshot()
    const a = packHotWindowCached({
      snapshot: snap,
      scope: { type: 'all' },
      mode: 'auto',
      dayWindowDays: 7,
      tokenBudget: 500,
      now,
    })
    const b = packHotWindowCached({
      snapshot: snap,
      scope: { type: 'all' },
      mode: 'auto',
      dayWindowDays: 7,
      tokenBudget: 200,
      now,
    })
    expect(b).not.toBe(a)
  })
})
