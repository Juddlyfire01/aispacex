import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../types/venice'
import {
  ensureToolResultPairs,
  repairToolMessagePairs,
  toolPairsAreComplete,
} from './tool-message-pairs'

const toolCall = (id: string, name = 'intel_x') => ({
  id,
  type: 'function' as const,
  function: { name, arguments: '{}' },
})

describe('ensureToolResultPairs', () => {
  it('keeps complete tool_use + tool_result pairs', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('toolu_01XGFmFRHtcdJJFGAY6BkdwP')],
      },
      {
        role: 'tool',
        content: '{"ok":true}',
        tool_call_id: 'toolu_01XGFmFRHtcdJJFGAY6BkdwP',
      },
    ]
    const out = ensureToolResultPairs(msgs)
    expect(toolPairsAreComplete(out)).toBe(true)
    expect(out).toHaveLength(3)
    expect(out[2]?.tool_call_id).toBe('toolu_01XGFmFRHtcdJJFGAY6BkdwP')
  })

  it('stubs missing tool_result so Claude accepts the transcript', () => {
    // Reproduces: messages.2 tool_use without tool_result (write-now would be next).
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'draft burns' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('toolu_01XGFmFRHtcdJJFGAY6BkdwP', 'compose_write_draft')],
      },
      { role: 'user', content: 'DRAFT STAGE — write now' },
    ]
    const out = ensureToolResultPairs(msgs)
    expect(toolPairsAreComplete(out)).toBe(true)
    expect(out[1]?.role).toBe('assistant')
    expect(out[2]).toEqual(
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'toolu_01XGFmFRHtcdJJFGAY6BkdwP',
      }),
    )
    expect(out[3]?.role).toBe('user')
    expect(JSON.parse(String(out[2]?.content))).toMatchObject({ status: 'omitted' })
  })

  it('fills only the missing result when one of two tools lacks a result', () => {
    const msgs: ChatMessage[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [toolCall('a'), toolCall('b')],
      },
      { role: 'tool', content: '{"a":1}', tool_call_id: 'a' },
    ]
    const out = ensureToolResultPairs(msgs)
    expect(out).toHaveLength(3)
    expect(out[1]?.tool_call_id).toBe('a')
    expect(out[1]?.content).toBe('{"a":1}')
    expect(out[2]?.tool_call_id).toBe('b')
    expect(JSON.parse(String(out[2]?.content))).toMatchObject({ status: 'omitted' })
  })

  it('drops orphan tool results', () => {
    const out = ensureToolResultPairs([
      { role: 'tool', content: '{}', tool_call_id: 'orphan' },
      { role: 'user', content: 'hi' },
    ])
    expect(out).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('normalizes empty tool_call ids', () => {
    const out = ensureToolResultPairs([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '', type: 'function', function: { name: 'x', arguments: '{}' } },
        ],
      },
    ])
    expect(out[0]?.tool_calls?.[0]?.id).toBe('call_0')
    expect(out[1]?.tool_call_id).toBe('call_0')
  })
})

describe('repairToolMessagePairs', () => {
  it('strips tool_use when tool_result is missing', () => {
    const repaired = repairToolMessagePairs([
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: 'thinking…',
        tool_calls: [toolCall('t1')],
      },
      { role: 'user', content: 'write now' },
    ])
    expect(repaired).toEqual([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'thinking…' },
      { role: 'user', content: 'write now' },
    ])
  })
})
