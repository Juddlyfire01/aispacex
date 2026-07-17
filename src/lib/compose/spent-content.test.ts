import { describe, it, expect } from 'vitest'
import { makePost, makeSubject } from '../intel-library/test-fixtures'
import type { IntelSnapshot } from '../intel-library/types'
import type { HistorySnapshot } from './history-library'
import type { ComposeThread } from './thread-types'
import { emptyArticleDraft, emptySegment } from './types'
import { buildSpentContentPack, SPENT_TOKEN_BUDGET } from './spent-content'
import { estimateTokens } from './token-estimate'

function emptyDraft() {
  return {
    id: 'd1',
    segments: [emptySegment()],
    target: { kind: 'original' as const },
    longform: false,
    madeWithAi: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
}

function thread(partial: Partial<ComposeThread> & Pick<ComposeThread, 'id'>): ComposeThread {
  return {
    context: { type: 'me' },
    title: 'Untitled',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    messages: [],
    draft: emptyDraft(),
    tokenEstimate: 0,
    preview: '',
    ...partial,
  }
}

describe('buildSpentContentPack', () => {
  it('returns empty when nothing spent', () => {
    const snap: IntelSnapshot = { subjects: [] }
    const history: HistorySnapshot = { threads: [] }
    const pack = buildSpentContentPack({ snapshot: snap, history })
    expect(pack.text).toBe('')
    expect(pack.estimatedTokens).toBe(0)
  })

  it('includes self posts newest-first with fingerprints', () => {
    const snap: IntelSnapshot = {
      subjects: [
        makeSubject({
          kind: 'self',
          id: 'me',
          username: 'me_user',
          posts: [
            makePost({
              id: 'old',
              kind: 'original',
              text: 'Staking is the only path.\n$VVV $DIEM forever',
              createdAt: '2026-07-01T10:00:00.000Z',
            }),
            makePost({
              id: 'new',
              kind: 'quote',
              text: 'Privacy wins when inference is private.\nSee https://x.com/i/status/2075587500908333628',
              createdAt: '2026-07-15T10:00:00.000Z',
            }),
            makePost({
              id: 'rt',
              kind: 'retweet',
              text: 'Someone else said this',
              createdAt: '2026-07-16T10:00:00.000Z',
            }),
          ],
        }),
        makeSubject({
          kind: 'target',
          id: 'other',
          username: 'AskVenice',
          posts: [
            makePost({
              id: 't1',
              text: 'Target post should not appear',
              createdAt: '2026-07-16T12:00:00.000Z',
            }),
          ],
        }),
      ],
    }
    const pack = buildSpentContentPack({
      snapshot: snap,
      history: { threads: [] },
    })
    expect(pack.text).toMatch(/## SPENT \/ PRIOR ART/)
    expect(pack.text.indexOf('post:new')).toBeLessThan(pack.text.indexOf('post:old'))
    expect(pack.text).toMatch(/opener:/)
    expect(pack.text).toMatch(/2075587500908333628/)
    expect(pack.text).toMatch(/cashtags:/)
    expect(pack.text).not.toMatch(/post:rt/)
    expect(pack.text).not.toMatch(/Target post/)
    expect(pack.estimatedTokens).toBe(estimateTokens(pack.text))
  })

  it('includes history draft segments and articles', () => {
    const seg = emptySegment()
    seg.text = 'Draft opener about burns compounding.'
    const art = emptyArticleDraft()
    art.title = 'Article title'
    art.bodyMarkdown = 'Article body with @alice @bob @carol stack.'
    const history: HistorySnapshot = {
      threads: [
        thread({
          id: 't-new',
          updatedAt: '2026-07-14T00:00:00.000Z',
          title: 'Burns chat',
          draft: { ...emptyDraft(), segments: [seg] },
        }),
        thread({
          id: 't-art',
          updatedAt: '2026-07-12T00:00:00.000Z',
          draft: { ...emptyDraft(), segments: [emptySegment()], article: art },
        }),
      ],
    }
    const pack = buildSpentContentPack({
      snapshot: { subjects: [] },
      history,
    })
    expect(pack.text).toMatch(/draft:t-new/)
    expect(pack.text).toMatch(/Draft opener about burns/)
    expect(pack.text).toMatch(/draft:t-art/)
    expect(pack.text).toMatch(/Article title/)
    expect(pack.text).toMatch(/handles:/)
  })

  it('puts currentDraftText first when provided', () => {
    const snap: IntelSnapshot = {
      subjects: [
        makeSubject({
          kind: 'self',
          id: 'me',
          username: 'me',
          posts: [
            makePost({
              id: 'p1',
              text: 'Old published opener',
              createdAt: '2026-07-15T00:00:00.000Z',
            }),
          ],
        }),
      ],
    }
    const pack = buildSpentContentPack({
      snapshot: snap,
      history: { threads: [] },
      currentDraftText: 'Current drawer line one',
    })
    expect(pack.text.indexOf('currentDraft')).toBeLessThan(pack.text.indexOf('post:p1'))
    expect(pack.text).toMatch(/Current drawer line one/)
  })

  it('trims to token budget', () => {
    const posts = Array.from({ length: 40 }, (_, i) =>
      makePost({
        id: `p${i}`,
        text: `Post number ${i} with a long enough body to burn tokens. `.repeat(8),
        createdAt: `2026-07-${String((i % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
      }),
    )
    const snap: IntelSnapshot = {
      subjects: [makeSubject({ kind: 'self', id: 'me', username: 'me', posts })],
    }
    const pack = buildSpentContentPack({
      snapshot: snap,
      history: { threads: [] },
      tokenBudget: 400,
    })
    expect(pack.estimatedTokens).toBeLessThanOrEqual(400)
    expect(pack.text).toMatch(/## SPENT \/ PRIOR ART/)
    expect(pack.estimatedTokens).toBeGreaterThan(0)
  })

  it('exports a sensible default budget', () => {
    expect(SPENT_TOKEN_BUDGET).toBeGreaterThanOrEqual(2000)
    expect(SPENT_TOKEN_BUDGET).toBeLessThanOrEqual(4000)
  })
})
