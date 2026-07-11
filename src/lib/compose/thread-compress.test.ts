import { describe, it, expect } from 'vitest'
import { VeniceAPIError } from '../venice-client'
import {
  COMPRESS_THRESHOLD,
  COMPLETION_RESERVE,
  estimateChatPayloadTokens,
  shouldCompressPayload,
} from './token-estimate'
import {
  buildCompressMarker,
  isContextOverflowError,
  keepRecentCount,
  KEEP_RECENT_MIN,
  splitMessagesForCompress,
} from './thread-compress'
import type { ComposeMessage } from './thread-types'

describe('shouldCompressPayload', () => {
  it('triggers at the compress threshold', () => {
    const limit = 100_000
    expect(shouldCompressPayload(limit * COMPRESS_THRESHOLD - 1, limit)).toBe(false)
    expect(shouldCompressPayload(limit * COMPRESS_THRESHOLD, limit)).toBe(true)
  })
})

describe('estimateChatPayloadTokens', () => {
  it('includes system, messages, and completion reserve', () => {
    const n = estimateChatPayloadTokens('abcd', [{ content: 'efgh' }], {
      completionReserve: COMPLETION_RESERVE,
    })
    // 1 + 4 + 1 + 4 + 4096
    expect(n).toBe(1 + 4 + 1 + 4 + COMPLETION_RESERVE)
  })
})

describe('splitMessagesForCompress', () => {
  const msgs = (n: number): ComposeMessage[] =>
    Array.from({ length: n }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }))

  it('archives the head and keeps the tail', () => {
    const { toArchive, toKeep } = splitMessagesForCompress(msgs(10), 4)
    expect(toArchive.map((m) => m.content)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5'])
    expect(toKeep.map((m) => m.content)).toEqual(['m6', 'm7', 'm8', 'm9'])
  })

  it('archives nothing when under keep count', () => {
    const { toArchive, toKeep } = splitMessagesForCompress(msgs(3), 6)
    expect(toArchive).toEqual([])
    expect(toKeep).toHaveLength(3)
  })
})

describe('keepRecentCount', () => {
  it('keeps preferred unless forced aggressive', () => {
    expect(keepRecentCount(40, false)).toBeGreaterThanOrEqual(KEEP_RECENT_MIN)
    expect(keepRecentCount(40, true)).toBe(KEEP_RECENT_MIN)
  })
})

describe('buildCompressMarker', () => {
  it('mentions cold history and the summary', () => {
    const m = buildCompressMarker('We decided on tone X.', 12)
    expect(m.role).toBe('assistant')
    expect(m.content).toContain('cold history')
    expect(m.content).toContain('12 messages')
    expect(m.content).toContain('tone X')
  })
})

describe('isContextOverflowError', () => {
  it('detects Venice context overflow codes and 413', () => {
    expect(
      isContextOverflowError(
        new VeniceAPIError('too big', 400, 'context_length_exceeded'),
      ),
    ).toBe(true)
    expect(isContextOverflowError(new VeniceAPIError('too big', 400, 'too_many_tokens'))).toBe(
      true,
    )
    expect(isContextOverflowError(new VeniceAPIError('payload', 413))).toBe(true)
    expect(isContextOverflowError(new VeniceAPIError('nope', 500))).toBe(false)
    expect(isContextOverflowError(new Error('maximum context exceeded'))).toBe(true)
  })
})
