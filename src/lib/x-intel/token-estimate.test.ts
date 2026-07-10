import { describe, it, expect } from 'vitest'
import {
  estimateTextTokens,
  estimateMessagesTokens,
  estimateExpectedCompletionTokens,
  streamCallFraction,
  mapReportStreamProgress,
} from './token-estimate'

describe('estimateTextTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTextTokens('')).toBe(0)
  })

  it('uses ~4 chars per token, rounding up', () => {
    expect(estimateTextTokens('abcd')).toBe(1)      // 4 chars → 1
    expect(estimateTextTokens('abcde')).toBe(2)     // 5 chars → ceil(1.25) = 2
    expect(estimateTextTokens('a'.repeat(400))).toBe(100)
  })
})

describe('estimateMessagesTokens', () => {
  it('sums content estimates plus per-message overhead', () => {
    // 'abcd' → 1 token + 4 overhead = 5; two such messages = 10
    expect(estimateMessagesTokens([
      { role: 'system', content: 'abcd' },
      { role: 'user', content: 'abcd' },
    ])).toBe(10)
  })

  it('returns 0 for no messages', () => {
    expect(estimateMessagesTokens([])).toBe(0)
  })

  it('charges overhead even for empty-content messages', () => {
    expect(estimateMessagesTokens([{ role: 'user', content: '' }])).toBe(4)
  })
})

describe('estimateExpectedCompletionTokens', () => {
  it('uses prompt ratio clamped to soft bounds when no prior', () => {
    const n = estimateExpectedCompletionTokens({ kind: 'narrative', promptTokens: 5000 })
    expect(n).toBeGreaterThanOrEqual(900)
    expect(n).toBeLessThanOrEqual(3200)
  })

  it('personalizes from prior completion tokens', () => {
    const n = estimateExpectedCompletionTokens({
      kind: 'narrative',
      promptTokens: 5000,
      prior: { completionTokens: 1800 },
      priorIncludedChange: false,
    })
    expect(n).toBe(1800)
  })

  it('splits prior when change step was included', () => {
    const n = estimateExpectedCompletionTokens({
      kind: 'narrative',
      promptTokens: 5000,
      prior: { completionTokens: 2000 },
      priorIncludedChange: true,
    })
    expect(n).toBe(Math.round(2000 * 0.85))
  })
})

describe('stream progress mapping', () => {
  it('never reaches 1.0 mid-stream', () => {
    expect(streamCallFraction(10_000, 1000)).toBeLessThan(1)
    expect(mapReportStreamProgress('narrative', 1, false)).toBeLessThan(1)
  })

  it('places change phase after narrative', () => {
    const midNarr = mapReportStreamProgress('narrative', 0.5, true)
    const startChange = mapReportStreamProgress('change', 0, true)
    expect(startChange).toBeGreaterThanOrEqual(midNarr)
  })
})
