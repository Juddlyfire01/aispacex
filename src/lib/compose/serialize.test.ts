import { describe, it, expect } from 'vitest'
import { serializeDraftForCopy } from './serialize'
import { emptyDraft, emptySegment } from './types'
import type { PostDraft } from './types'

const ID = '2075587500908333628'

function draftWith(texts: string[], target: PostDraft['target'] = { kind: 'original' }): PostDraft {
  const draft = emptyDraft(target)
  draft.segments = texts.map((t) => ({ ...emptySegment(), text: t }))
  return draft
}

describe('serializeDraftForCopy', () => {
  it('rewrites bare snowflakes and post: ids to permalinks', () => {
    const out = serializeDraftForCopy(draftWith([`see ${ID} and post:${ID}`]))
    expect(out).toContain(`https://x.com/i/status/${ID}`)
    // Every occurrence of the ID must be inside a status permalink
    const occurrences = [...out.matchAll(new RegExp(ID, 'g'))]
    expect(occurrences.length).toBeGreaterThan(0)
    for (const m of occurrences) {
      const start = m.index ?? 0
      expect(out.slice(Math.max(0, start - 'status/'.length), start)).toBe('status/')
    }
  })

  it('does not double-rewrite ids already inside status URLs', () => {
    const url = `https://x.com/i/status/${ID}`
    expect(serializeDraftForCopy(draftWith([`link ${url}`])).trim()).toBe(`link ${url}`)
  })

  it('appends reply target permalink', () => {
    const out = serializeDraftForCopy(
      draftWith(['nice'], { kind: 'reply', toPostId: ID, toUsername: 'bob' }),
    )
    expect(out).toContain('nice')
    expect(out).toContain(`https://x.com/i/status/${ID}`)
    expect(out).toMatch(/@bob/)
  })

  it('appends quote target permalink', () => {
    const out = serializeDraftForCopy(
      draftWith(['adding'], { kind: 'quote', postId: ID, username: 'ann' }),
    )
    expect(out).toContain('adding')
    expect(out).toContain(`https://x.com/i/status/${ID}`)
    expect(out).toMatch(/@ann/)
  })

  it('numbers thread segments after rewrite', () => {
    const out = serializeDraftForCopy(draftWith([`first ${ID}`, 'second']))
    expect(out.startsWith('1/2')).toBe(true)
    expect(out).toContain('2/2 second')
    expect(out).toContain(`https://x.com/i/status/${ID}`)
  })
})
