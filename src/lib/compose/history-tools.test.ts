import { describe, it, expect } from 'vitest'
import type { ComposeThread } from './thread-types'
import { emptyDraft } from './types'
import { buildHistorySnapshot } from './history-library'
import { COMPOSE_HISTORY_TOOLS, executeHistoryTool } from './history-tools'

function makeThread(
  partial: Partial<ComposeThread> & Pick<ComposeThread, 'id' | 'context' | 'title'>,
): ComposeThread {
  const now = '2026-07-09T12:00:00.000Z'
  return {
    createdAt: now,
    updatedAt: partial.updatedAt ?? now,
    messages: partial.messages ?? [],
    draft: emptyDraft(),
    tokenEstimate: partial.tokenEstimate ?? 100,
    preview: partial.preview ?? partial.title,
    ...partial,
  }
}

const meThread = makeThread({
  id: 't-me',
  context: { type: 'me' },
  title: 'Staking APR draft',
  preview: 'Help me write about staking APR',
  messages: [
    { role: 'user', content: 'Help me write about staking APR' },
    { role: 'assistant', content: 'Here is a staking APR angle.' },
  ],
})

const targetThread = makeThread({
  id: 't-target',
  context: { type: 'target', username: 'AskVenice' },
  title: 'Reply to AskVenice',
  messages: [
    { role: 'user', content: 'Draft a reply about DIEM minting' },
    { role: 'assistant', content: 'Something about DIEM.' },
  ],
})

const snap = buildHistorySnapshot(
  { [meThread.id]: meThread, [targetThread.id]: targetThread },
  [meThread.id, targetThread.id],
)
const ctx = { snapshot: snap }

describe('COMPOSE_HISTORY_TOOLS', () => {
  it('defines the four history tools', () => {
    const names = COMPOSE_HISTORY_TOOLS.map((t) => t.function.name)
    expect(names).toEqual([
      'compose_history_list',
      'compose_history_grep',
      'compose_history_glob',
      'compose_history_get',
    ])
    for (const t of COMPOSE_HISTORY_TOOLS) {
      expect(t.type).toBe('function')
      expect(t.function.description).toBeTruthy()
      expect(t.function.parameters).toBeTruthy()
    }
  })
})

describe('executeHistoryTool', () => {
  it('list returns summaries', () => {
    const result = executeHistoryTool('compose_history_list', {}, ctx)
    expect(Array.isArray(result)).toBe(true)
    const list = result as Array<Record<string, unknown>>
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      id: 't-me',
      title: expect.any(String),
      messageCount: expect.any(Number),
    })
    expect(list[0]).not.toHaveProperty('messages')
  })

  it('grep finds staking in me thread', () => {
    const result = executeHistoryTool('compose_history_grep', { query: 'staking' }, ctx)
    expect(Array.isArray(result)).toBe(true)
    const hits = result as Array<{ threadId: string }>
    expect(hits.some((h) => h.threadId === 't-me')).toBe(true)
  })

  it('glob matches target path', () => {
    const result = executeHistoryTool(
      'compose_history_glob',
      { pattern: 'history/target/@AskVenice/*' },
      ctx,
    )
    expect(Array.isArray(result)).toBe(true)
    const hits = result as Array<{ path: string }>
    expect(hits.some((h) => h.path.includes('t-target'))).toBe(true)
  })

  it('get returns thread by id', () => {
    const result = executeHistoryTool('compose_history_get', { threadId: 't-me' }, ctx)
    expect(result).toMatchObject({ id: 't-me' })
    expect(result).toHaveProperty('messages')
  })

  it('unknown tool returns error', () => {
    const result = executeHistoryTool('compose_history_nope', {}, ctx)
    expect(result).toEqual({ error: expect.any(String) })
    expect((result as { error: string }).error).toMatch(/unknown/i)
  })
})
