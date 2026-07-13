import { describe, it, expect } from 'vitest'
import {
  autoTitleFromUserText,
  messagePreview,
  estimateThreadTokens,
  contextBadgeLabel,
  formatDayLabel,
  formatRelativeTime,
  formatTokenCount,
  groupThreadsByDay,
  localDayKey,
  scopeToPathSegment,
  threadExportFilename,
  threadToJson,
  threadToMarkdown,
} from './thread-meta'
import type { ChatMessage } from '../../types/venice'
import type { ComposeThread } from './thread-types'
import { emptyDraft } from './types'

describe('autoTitleFromUserText', () => {
  it('collapses whitespace and truncates to 60', () => {
    expect(autoTitleFromUserText('  hello   world  ')).toBe('hello world')
    const long = 'a'.repeat(80)
    expect(autoTitleFromUserText(long).length).toBe(60)
  })
  it('empty becomes New chat', () => {
    expect(autoTitleFromUserText('')).toBe('New chat')
    expect(autoTitleFromUserText('   ')).toBe('New chat')
  })
})

describe('contextBadgeLabel', () => {
  it('labels scopes', () => {
    expect(contextBadgeLabel({ type: 'me' })).toBe('You')
    expect(contextBadgeLabel({ type: 'all' })).toBe('All')
    expect(contextBadgeLabel({ type: 'target', username: 'AskVenice' })).toBe('@AskVenice')
  })
})

describe('scopeToPathSegment', () => {
  it('builds glob path segments', () => {
    expect(scopeToPathSegment({ type: 'me' })).toBe('me')
    expect(scopeToPathSegment({ type: 'all' })).toBe('all')
    expect(scopeToPathSegment({ type: 'target', username: 'AskVenice' })).toBe('target/@AskVenice')
  })
})

describe('messagePreview', () => {
  it('prefers first user line', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'First idea about privacy' },
      { role: 'assistant', content: 'Sure' },
    ]
    expect(messagePreview(msgs)).toContain('First idea')
  })
})

describe('estimateThreadTokens', () => {
  it('is positive for non-empty messages', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: 'abcd' }]
    const draft = emptyDraft({ kind: 'original' })
    expect(estimateThreadTokens(msgs, draft)).toBeGreaterThan(0)
  })
})

describe('formatTokenCount', () => {
  it('formats k', () => {
    expect(formatTokenCount(500)).toBe('~500')
    expect(formatTokenCount(1200)).toBe('~1.2k')
  })
})

describe('formatRelativeTime', () => {
  it('returns a non-empty string', () => {
    const iso = new Date().toISOString()
    expect(formatRelativeTime(iso, new Date()).length).toBeGreaterThan(0)
  })
})

describe('formatDayLabel / groupThreadsByDay', () => {
  const now = new Date(2026, 6, 11, 15, 0, 0) // Jul 11, 2026 local

  it('labels today, yesterday, and older calendar dates', () => {
    expect(formatDayLabel(new Date(2026, 6, 11, 9, 0, 0).toISOString(), now)).toBe(
      'Today',
    )
    expect(formatDayLabel(new Date(2026, 6, 10, 20, 0, 0).toISOString(), now)).toBe(
      'Yesterday',
    )
    expect(formatDayLabel(new Date(2026, 6, 9, 12, 0, 0).toISOString(), now)).toBe(
      'Jul 9, 2026',
    )
  })

  it('groups consecutive same-day threads preserving order', () => {
    const a = { id: 'a', updatedAt: new Date(2026, 6, 11, 14, 0, 0).toISOString() }
    const b = { id: 'b', updatedAt: new Date(2026, 6, 11, 10, 0, 0).toISOString() }
    const c = { id: 'c', updatedAt: new Date(2026, 6, 10, 8, 0, 0).toISOString() }
    const groups = groupThreadsByDay([a, b, c], now)
    expect(groups).toHaveLength(2)
    expect(groups[0]!.label).toBe('Today')
    expect(groups[0]!.threads.map((t) => t.id)).toEqual(['a', 'b'])
    expect(groups[1]!.label).toBe('Yesterday')
    expect(groups[1]!.dayKey).toBe(localDayKey(c.updatedAt, now))
  })
})

function sampleThread(partial?: Partial<ComposeThread>): ComposeThread {
  const draft = emptyDraft({ kind: 'original' })
  draft.segments[0]!.text = 'Draft line'
  return {
    id: 't1',
    context: { type: 'all' },
    title: 'Privacy thread',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-09T12:00:00.000Z',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ],
    draft,
    tokenEstimate: 10,
    preview: 'Hello',
    ...partial,
  }
}

describe('threadToMarkdown', () => {
  it('includes title, roles, and draft', () => {
    const md = threadToMarkdown(sampleThread())
    expect(md).toContain('# Privacy thread')
    expect(md).toContain('## You')
    expect(md).toContain('Hello')
    expect(md).toContain('## Assistant')
    expect(md).toContain('## Draft')
    expect(md).toContain('Draft line')
    expect(md).toContain('IntelX Compose')
  })
})

describe('threadToJson', () => {
  it('wraps full thread with envelope', () => {
    const thread = sampleThread()
    const parsed = JSON.parse(threadToJson(thread)) as {
      source: string
      version: number
      thread: ComposeThread
    }
    expect(parsed.source).toBe('intelx-compose')
    expect(parsed.version).toBe(1)
    expect(parsed.thread.id).toBe(thread.id)
    expect(parsed.thread.messages).toHaveLength(2)
    expect(parsed.thread.draft.segments[0]?.text).toBe('Draft line')
  })
})

describe('threadExportFilename', () => {
  it('slugifies title and format', () => {
    expect(threadExportFilename(sampleThread())).toBe('privacy-thread.md')
    expect(threadExportFilename(sampleThread(), 'json')).toBe('privacy-thread.json')
    expect(threadExportFilename(sampleThread({ title: '!!!' }))).toBe('compose-chat.md')
  })
})
