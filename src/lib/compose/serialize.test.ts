import { describe, it, expect } from 'vitest'
import { serializeDraftForCopy } from './serialize'
import { emptyDraft, emptySegment } from './types'
import type { PostDraft } from './types'

function draftWith(texts: string[], target: PostDraft['target'] = { kind: 'original' }): PostDraft {
  const draft = emptyDraft(target)
  draft.segments = texts.map((t) => ({ ...emptySegment(), text: t }))
  return draft
}

describe('serializeDraftForCopy', () => {
  it('returns the single segment text for an original', () => {
    expect(serializeDraftForCopy(draftWith(['hello world']))).toBe('hello world')
  })

  it('numbers thread segments', () => {
    const out = serializeDraftForCopy(draftWith(['first', 'second']))
    expect(out).toBe('1/2 first\n\n2/2 second')
  })

  it('copies reply body without target prefix', () => {
    const out = serializeDraftForCopy(draftWith(['nice post'], { kind: 'reply', toPostId: '9', toUsername: 'bob' }))
    expect(out).toBe('nice post')
  })

  it('copies quote body without target prefix', () => {
    const out = serializeDraftForCopy(draftWith(['adding this'], { kind: 'quote', postId: '7', username: 'ann' }))
    expect(out).toBe('adding this')
  })
})
