import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sampleSnapshot } from '../intel-library/test-fixtures'

const veniceMock = vi.fn()

vi.mock('../venice-client', () => ({
  venice: (...args: unknown[]) => veniceMock(...args),
}))

import { runComposeAgent } from './compose-agent'

describe('runComposeAgent', () => {
  beforeEach(() => {
    veniceMock.mockReset()
  })

  it('runs tool round then returns final text', async () => {
    veniceMock
      .mockResolvedValueOnce({
        id: '1',
        object: 'chat.completion',
        created: 0,
        model: 'test',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'intel_grep',
                    arguments: JSON.stringify({ query: 'staking' }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: '2',
        object: 'chat.completion',
        created: 0,
        model: 'test',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Found it.',
            },
          },
        ],
      })

    const onTool = vi.fn()
    const result = await runComposeAgent({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'You are a ghostwriter.' },
        { role: 'user', content: 'Find staking posts' },
      ],
      snapshot: sampleSnapshot(),
      historySnapshot: { threads: [] },
      scope: { type: 'all' },
      xSearchOn: false,
      onTool,
    })

    expect(result.content).toBe('Found it.')
    expect(result.toolCalls).toBeGreaterThanOrEqual(1)
    expect(veniceMock).toHaveBeenCalledTimes(2)
    expect(onTool).toHaveBeenCalledWith({
      name: 'intel_grep',
      args: { query: 'staking' },
    })

    // Second request should include the tool result message
    const secondBody = JSON.parse(veniceMock.mock.calls[1]![1].body as string) as {
      messages: Array<{ role: string; content?: string | null }>
    }
    expect(secondBody.messages.some((m) => m.role === 'tool')).toBe(true)
  })
})
