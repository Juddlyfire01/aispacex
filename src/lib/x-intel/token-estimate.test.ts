import { describe, it, expect } from 'vitest'
import { estimateTextTokens, estimateMessagesTokens } from './token-estimate'

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
