import { describe, expect, it } from 'vitest'
import {
  formatAlphaHot,
  mergeHotWithAlpha,
  ALPHA_HOT_TOKEN_BUDGET,
} from './alpha-hot'
import type { AlphaArchiveState } from '../alpha/archive'
import { estimateTokens } from './token-estimate'

function empty(): AlphaArchiveState {
  return { briefs: {}, stories: {}, posts: {} }
}

describe('formatAlphaHot', () => {
  it('returns empty when archive is empty', () => {
    expect(formatAlphaHot(empty())).toBe('')
  })

  it('formats recent briefs and stories', () => {
    const state: AlphaArchiveState = {
      briefs: {
        b1: {
          id: 'b1',
          kind: 'global',
          markdown: '# Accel\n\nSomething big on X',
          model: 'grok',
          fetchedAt: Date.now(),
          pinned: false,
        },
      },
      stories: {
        s1: {
          id: 's1',
          name: 'Cluster story',
          clusterPostIds: ['1'],
          fetchedAt: Date.now(),
          pinned: false,
        },
      },
      posts: {},
    }
    const block = formatAlphaHot(state)
    expect(block).toContain('ALPHA RADAR')
    expect(block).toContain('b1')
    expect(block).toContain('Cluster story')
    expect(block).toMatch(/alpha_\*/)
  })

  it('prefers newest global brief and caps rail briefs + stories', () => {
    const now = Date.now()
    const state: AlphaArchiveState = {
      briefs: {
        old: {
          id: 'old',
          kind: 'global',
          markdown: 'OLD GLOBAL',
          model: 'grok',
          fetchedAt: now - 10_000,
          pinned: false,
        },
        fresh: {
          id: 'fresh',
          kind: 'global',
          markdown: 'FRESH GLOBAL',
          model: 'grok',
          fetchedAt: now,
          pinned: false,
        },
        r1: {
          id: 'r1',
          kind: 'rail',
          railId: 'rail-a',
          railLabel: 'Rail A',
          markdown: 'rail one body',
          model: 'grok',
          fetchedAt: now,
          pinned: false,
        },
        r2: {
          id: 'r2',
          kind: 'rail',
          railId: 'rail-b',
          railLabel: 'Rail B',
          markdown: 'rail two body',
          model: 'grok',
          fetchedAt: now - 1,
          pinned: false,
        },
        r3: {
          id: 'r3',
          kind: 'rail',
          railId: 'rail-c',
          railLabel: 'Rail C',
          markdown: 'rail three should drop',
          model: 'grok',
          fetchedAt: now - 2,
          pinned: false,
        },
      },
      stories: Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [
          `s${i}`,
          {
            id: `s${i}`,
            name: `Story ${i}`,
            clusterPostIds: [],
            fetchedAt: now - i,
            pinned: false,
          },
        ]),
      ),
      posts: {},
    }
    const block = formatAlphaHot(state)
    expect(block).toContain('FRESH GLOBAL')
    expect(block).not.toContain('OLD GLOBAL')
    expect(block).toContain('Rail A')
    expect(block).toContain('Rail B')
    expect(block).not.toContain('Rail C')
    expect(block).toContain('Story 0')
    expect(block).toContain('Story 4')
    expect(block).not.toContain('Story 5')
  })

  it('drops story lines first when over token budget', () => {
    const now = Date.now()
    // One story line alone exceeds ALPHA_HOT_TOKEN_BUDGET (~chars/4).
    const longName = `Must Drop ${'X'.repeat(5000)}`
    const state: AlphaArchiveState = {
      briefs: {
        b1: {
          id: 'b1',
          kind: 'global',
          markdown: 'short brief',
          model: 'grok',
          fetchedAt: now,
          pinned: false,
        },
      },
      stories: {
        s1: {
          id: 's1',
          name: longName,
          clusterPostIds: [],
          fetchedAt: now,
          pinned: false,
        },
        s2: {
          id: 's2',
          name: `Also Huge ${'Y'.repeat(5000)}`,
          clusterPostIds: [],
          fetchedAt: now - 1,
          pinned: false,
        },
      },
      posts: {},
    }
    const block = formatAlphaHot(state)
    expect(block).toContain('ALPHA RADAR')
    expect(block).toContain('short brief')
    expect(estimateTokens(block)).toBeLessThanOrEqual(ALPHA_HOT_TOKEN_BUDGET)
    // Long story lines are dropped before the brief is removed.
    expect(block).not.toContain('Must Drop')
    expect(block).not.toContain('Also Huge')
  })
})

describe('mergeHotWithAlpha', () => {
  it('merge appends after intel text', () => {
    const { text } = mergeHotWithAlpha('===== LOCAL INTEL =====\nhi', empty())
    expect(text).toContain('LOCAL INTEL')
  })

  it('appends alpha block when present', () => {
    const state: AlphaArchiveState = {
      briefs: {
        b1: {
          id: 'b1',
          kind: 'global',
          markdown: 'brief',
          model: 'grok',
          fetchedAt: Date.now(),
          pinned: false,
        },
      },
      stories: {},
      posts: {},
    }
    const { text, alphaTokens } = mergeHotWithAlpha(
      '===== LOCAL INTEL =====\nhi',
      state,
    )
    expect(text).toMatch(/LOCAL INTEL/)
    expect(text).toMatch(/ALPHA RADAR/)
    expect(alphaTokens).toBeGreaterThan(0)
  })
})
