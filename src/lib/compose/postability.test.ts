import { describe, it, expect } from 'vitest'
import { classifyPostability } from './postability'
import { emptyArticleDraft, emptyDraft, emptySegment } from './types'
import type { PostDraft } from './types'

const caps = { mediaNativeSupported: false }

function withMedia(): PostDraft {
  const draft = emptyDraft({ kind: 'original' })
  draft.segments = [{ ...emptySegment(), media: [{ id: 'm1', kind: 'image', dataUrl: 'data:...' }] }]
  return draft
}

function withArticle(): PostDraft {
  const draft = emptyDraft({ kind: 'original' })
  draft.article = { ...emptyArticleDraft(), title: 'Hello', bodyMarkdown: 'World' }
  return draft
}

describe('classifyPostability', () => {
  it('posts originals natively', () => {
    expect(classifyPostability(emptyDraft({ kind: 'original' }), caps)).toEqual({ mode: 'api' })
  })

  it('routes replies to copy', () => {
    const draft = emptyDraft({ kind: 'reply', toPostId: '1', toUsername: 'bob' })
    const result = classifyPostability(draft, caps)
    expect(result.mode).toBe('copy')
    expect(result.reason).toMatch(/summoned/i)
  })

  it('routes quotes to copy', () => {
    const draft = emptyDraft({ kind: 'quote', postId: '1', username: 'bob' })
    const result = classifyPostability(draft, caps)
    expect(result.mode).toBe('copy')
    expect(result.reason).toMatch(/quote/i)
  })

  it('routes media to copy when native upload is unsupported', () => {
    const result = classifyPostability(withMedia(), caps)
    expect(result.mode).toBe('copy')
    expect(result.reason).toMatch(/media/i)
  })

  it('posts media natively once supported', () => {
    expect(classifyPostability(withMedia(), { mediaNativeSupported: true })).toEqual({ mode: 'api' })
  })

  it('routes articles to copy until Articles API is wired', () => {
    const result = classifyPostability(withArticle(), caps)
    expect(result.mode).toBe('copy')
    expect(result.reason).toMatch(/article/i)
  })
})
