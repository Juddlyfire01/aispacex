import { describe, it, expect } from 'vitest'
import type { ComposeThread } from './thread-types'
import { emptyDraft } from './types'
import {
  buildHistorySnapshot,
  listThreads,
  grepHistory,
  globHistory,
  getThread,
} from './history-library'

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
  updatedAt: '2026-07-09T14:00:00.000Z',
  tokenEstimate: 200,
  messages: [
    { role: 'user', content: 'Help me write about staking APR' },
    { role: 'assistant', content: 'Here is a staking APR angle for your post.' },
  ],
})

const targetThread = makeThread({
  id: 't-target',
  context: { type: 'target', username: 'AskVenice' },
  title: 'Reply to AskVenice',
  preview: 'Draft a reply about DIEM minting',
  updatedAt: '2026-07-09T13:00:00.000Z',
  tokenEstimate: 150,
  messages: [
    { role: 'user', content: 'Draft a reply about DIEM minting' },
    { role: 'assistant', content: 'Something about DIEM and staking cohorts.' },
  ],
})

const allThread = makeThread({
  id: 't-all',
  context: { type: 'all' },
  title: 'Market overview',
  preview: 'Summarize whale trades',
  updatedAt: '2026-07-09T12:30:00.000Z',
  messages: [{ role: 'user', content: 'Summarize whale trades this week' }],
})

const threads: Record<string, ComposeThread> = {
  [meThread.id]: meThread,
  [targetThread.id]: targetThread,
  [allThread.id]: allThread,
}
const order = [meThread.id, targetThread.id, allThread.id]
const snap = buildHistorySnapshot(threads, order)

describe('buildHistorySnapshot', () => {
  it('orders threads by order array', () => {
    expect(snap.threads.map((t) => t.id)).toEqual(['t-me', 't-target', 't-all'])
  })

  it('skips missing ids in order', () => {
    const s = buildHistorySnapshot(threads, ['t-me', 'missing', 't-all'])
    expect(s.threads.map((t) => t.id)).toEqual(['t-me', 't-all'])
  })
})

describe('listThreads', () => {
  it('returns summaries for all threads', () => {
    const list = listThreads(snap)
    expect(list).toHaveLength(3)
    expect(list[0]).toMatchObject({
      id: 't-me',
      title: 'Staking APR draft',
      messageCount: 2,
      tokenEstimate: 200,
    })
    expect(list[0]).not.toHaveProperty('messages')
  })

  it('filters by contextType', () => {
    const list = listThreads(snap, { contextType: 'target' })
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe('t-target')
  })

  it('filters by query over title and messages', () => {
    const list = listThreads(snap, { query: 'DIEM' })
    expect(list.map((t) => t.id)).toEqual(['t-target'])
  })

  it('respects limit', () => {
    expect(listThreads(snap, { limit: 1 })).toHaveLength(1)
  })
})

describe('grepHistory', () => {
  it('AND-matches terms across messages', () => {
    const hits = grepHistory(snap, { query: 'staking APR' })
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits.every((h) => h.threadId === 't-me')).toBe(true)
    expect(hits[0]).toMatchObject({
      threadId: 't-me',
      role: expect.any(String),
      index: expect.any(Number),
      snippet: expect.any(String),
    })
  })

  it('returns empty for empty query', () => {
    expect(grepHistory(snap, { query: '   ' })).toEqual([])
  })

  it('returns empty when limit is 0', () => {
    expect(grepHistory(snap, { query: 'staking', limit: 0 })).toEqual([])
  })

  it('filters by threadId', () => {
    const hits = grepHistory(snap, { query: 'APR', threadId: 't-target' })
    expect(hits).toEqual([])
    const meHits = grepHistory(snap, { query: 'APR', threadId: 't-me' })
    expect(meHits.length).toBeGreaterThanOrEqual(1)
    expect(meHits.every((h) => h.threadId === 't-me')).toBe(true)
  })
})

describe('globHistory', () => {
  it('matches history paths by scope and id', () => {
    const hits = globHistory(snap, 'history/target/@AskVenice/*')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.path).toBe('history/target/@AskVenice/t-target')
    expect(hits[0]!.meta.id).toBe('t-target')
  })

  it('matches me scope', () => {
    const hits = globHistory(snap, 'history/me/**')
    expect(hits.map((h) => h.path)).toEqual(['history/me/t-me'])
  })
})

describe('getThread', () => {
  it('returns full thread when under maxMessages', () => {
    const t = getThread(snap, 't-me')
    expect(t).toMatchObject({ id: 't-me' })
    expect('error' in t).toBe(false)
    if (!('error' in t)) {
      expect(t.messages).toHaveLength(2)
    }
  })

  it('slices last maxMessages when longer', () => {
    const long = makeThread({
      id: 't-long',
      context: { type: 'me' },
      title: 'Long',
      messages: Array.from({ length: 50 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `msg ${i}`,
      })),
    })
    const s = buildHistorySnapshot({ 't-long': long }, ['t-long'])
    const t = getThread(s, 't-long', { maxMessages: 10 })
    expect('error' in t).toBe(false)
    if (!('error' in t)) {
      expect(t.messages).toHaveLength(10)
      expect(t.messages[0]!.content).toBe('msg 40')
      expect(t.messages[9]!.content).toBe('msg 49')
    }
  })

  it('returns error for missing id', () => {
    expect(getThread(snap, 'nope')).toEqual({ error: 'thread_not_found' })
  })
})
