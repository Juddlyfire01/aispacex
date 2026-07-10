import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sampleSnapshot } from '../intel-library/test-fixtures'
import type { ChatCompletionChunk } from '../../types/venice'

const veniceMock = vi.fn()

vi.mock('../venice-client', () => ({
  venice: (...args: unknown[]) => veniceMock(...args),
}))

import { accumulateStreamedToolCalls, runComposeAgent } from './compose-agent'

/** Build a ReadableStream of SSE events from chat completion chunks. */
function sseStreamFromChunks(chunks: ChatCompletionChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const body =
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  })
}

function chunk(
  partial: Partial<ChatCompletionChunk['choices'][0]['delta']> & {
    finish_reason?: string | null
    usage?: ChatCompletionChunk['usage']
  },
): ChatCompletionChunk {
  const { finish_reason = null, usage, ...delta } = partial
  return {
    id: 'c',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'test',
    choices: [{ index: 0, delta, finish_reason }],
    usage,
  }
}

describe('accumulateStreamedToolCalls', () => {
  it('merges split name/arguments deltas by index', () => {
    const acc = new Map()
    accumulateStreamedToolCalls(acc, [
      { index: 0, id: 'call_1', type: 'function', function: { name: 'intel_', arguments: '' } },
    ])
    accumulateStreamedToolCalls(acc, [
      { index: 0, function: { name: 'grep', arguments: '{"q' } },
    ])
    accumulateStreamedToolCalls(acc, [
      { index: 0, function: { arguments: 'uery":"x"}' } },
    ])
    const call = acc.get(0)!
    expect(call.id).toBe('call_1')
    expect(call.function.name).toBe('intel_grep')
    expect(call.function.arguments).toBe('{"query":"x"}')
  })
})

describe('runComposeAgent', () => {
  beforeEach(() => {
    veniceMock.mockReset()
  })

  it('streams final text tokens and returns content', async () => {
    veniceMock.mockResolvedValueOnce(
      sseStreamFromChunks([
        chunk({ content: 'Hello ' }),
        chunk({ content: 'world', finish_reason: 'stop' }),
        chunk({
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        }),
      ]),
    )

    const deltas: string[] = []
    const result = await runComposeAgent({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'You are a ghostwriter.' },
        { role: 'user', content: 'Hi' },
      ],
      snapshot: sampleSnapshot(),
      historySnapshot: { threads: [] },
      scope: { type: 'all' },
      xSearchOn: false,
      onDelta: (t) => deltas.push(t),
    })

    expect(result.content).toBe('Hello world')
    expect(result.toolCalls).toBe(0)
    expect(deltas.join('')).toBe('Hello world')
    expect(veniceMock).toHaveBeenCalledTimes(1)

    const body = JSON.parse(veniceMock.mock.calls[0]![1].body as string) as {
      stream: boolean
      tools: unknown[]
    }
    expect(body.stream).toBe(true)
    expect(body.tools.length).toBeGreaterThan(0)
  })

  it('runs tool round then streams final text', async () => {
    veniceMock
      .mockResolvedValueOnce(
        sseStreamFromChunks([
          chunk({
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'intel_grep', arguments: '' },
              },
            ],
          }),
          chunk({
            tool_calls: [
              {
                index: 0,
                function: { arguments: JSON.stringify({ query: 'staking' }) },
              },
            ],
            finish_reason: 'tool_calls',
          }),
        ]),
      )
      .mockResolvedValueOnce(
        sseStreamFromChunks([
          chunk({ content: 'Found ' }),
          chunk({ content: 'it.', finish_reason: 'stop' }),
        ]),
      )

    const onTool = vi.fn()
    const onToolStart = vi.fn()
    const onContentReset = vi.fn()
    const deltas: string[] = []
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
      onToolStart,
      onContentReset,
      onDelta: (t) => deltas.push(t),
    })

    expect(result.content).toBe('Found it.')
    expect(result.toolCalls).toBeGreaterThanOrEqual(1)
    expect(veniceMock).toHaveBeenCalledTimes(2)
    expect(onToolStart).toHaveBeenCalledWith({
      index: 0,
      id: 'call_1',
      name: 'intel_grep',
    })
    expect(onTool).toHaveBeenCalledWith({
      index: 0,
      id: 'call_1',
      name: 'intel_grep',
      args: { query: 'staking' },
    })
    expect(deltas.join('')).toBe('Found it.')

    // Second request should include the tool result message
    const secondBody = JSON.parse(veniceMock.mock.calls[1]![1].body as string) as {
      messages: Array<{ role: string; content?: string | null }>
      stream: boolean
    }
    expect(secondBody.stream).toBe(true)
    expect(secondBody.messages.some((m) => m.role === 'tool')).toBe(true)
  })

  it('resets streamed content when a tool round follows prose', async () => {
    veniceMock
      .mockResolvedValueOnce(
        sseStreamFromChunks([
          chunk({ content: 'Looking up…' }),
          chunk({
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'intel_list_subjects',
                  arguments: '{}',
                },
              },
            ],
            finish_reason: 'tool_calls',
          }),
        ]),
      )
      .mockResolvedValueOnce(
        sseStreamFromChunks([chunk({ content: 'Done.', finish_reason: 'stop' })]),
      )

    const onContentReset = vi.fn()
    await runComposeAgent({
      model: 'test-model',
      messages: [{ role: 'user', content: 'list' }],
      snapshot: sampleSnapshot(),
      historySnapshot: { threads: [] },
      scope: { type: 'all' },
      xSearchOn: false,
      onContentReset,
    })

    expect(onContentReset).toHaveBeenCalledTimes(1)
  })

  it('announces onToolStart before onTool executes', async () => {
    veniceMock
      .mockResolvedValueOnce(
        sseStreamFromChunks([
          chunk({
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'intel_get_posts', arguments: '' },
              },
            ],
          }),
          chunk({
            tool_calls: [
              {
                index: 0,
                function: {
                  arguments: JSON.stringify({ handle: 'aixbt_agent', source: 'posts' }),
                },
              },
            ],
            finish_reason: 'tool_calls',
          }),
        ]),
      )
      .mockResolvedValueOnce(
        sseStreamFromChunks([chunk({ content: 'Analysis done.', finish_reason: 'stop' })]),
      )

    const order: string[] = []
    const result = await runComposeAgent({
      model: 'test-model',
      messages: [{ role: 'user', content: 'analyze' }],
      snapshot: sampleSnapshot(),
      historySnapshot: { threads: [] },
      scope: { type: 'all' },
      xSearchOn: true,
      onToolStart: ({ name }) => order.push(`start:${name}`),
      onTool: ({ name }) => order.push(`exec:${name}`),
    })

    expect(result.content).toBe('Analysis done.')
    expect(order[0]).toBe('start:intel_get_posts')
    expect(order).toContain('exec:intel_get_posts')
    expect(order.indexOf('start:intel_get_posts')).toBeLessThan(
      order.indexOf('exec:intel_get_posts'),
    )
  })
})
