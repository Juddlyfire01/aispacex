import { describe, it, expect } from 'vitest'
import {
  autoTitleFromUserText,
  messagePreview,
  estimateThreadTokens,
  contextBadgeLabel,
  formatRelativeTime,
  formatTokenCount,
  scopeToPathSegment,
} from './thread-meta'
import type { ChatMessage } from '../../types/venice'
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
