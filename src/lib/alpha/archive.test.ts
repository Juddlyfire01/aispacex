import { describe, expect, it } from 'vitest'
import {
  pruneAlphaArchive,
  upsertBrief,
  upsertStory,
  upsertPosts,
  setPinned,
  grepArchive,
  listArchive,
  type AlphaArchiveState,
} from './archive'
import { ALPHA_COLD_TTL_MS } from './default-rails'

function empty(): AlphaArchiveState {
  return { briefs: {}, stories: {}, posts: {} }
}

describe('pruneAlphaArchive', () => {
  it('drops unpinned items older than 24h and keeps pins', () => {
    const now = 1_000_000_000_000
    const state: AlphaArchiveState = {
      briefs: {
        old: {
          id: 'old',
          kind: 'global',
          markdown: 'x',
          model: 'grok',
          fetchedAt: now - ALPHA_COLD_TTL_MS - 1,
          pinned: false,
        },
        pinned: {
          id: 'pinned',
          kind: 'global',
          markdown: 'y',
          model: 'grok',
          fetchedAt: now - ALPHA_COLD_TTL_MS - 1,
          pinned: true,
        },
      },
      stories: {},
      posts: {},
    }
    const next = pruneAlphaArchive(state, now)
    expect(next.briefs.old).toBeUndefined()
    expect(next.briefs.pinned).toBeTruthy()
  })
})

describe('upsertPosts', () => {
  it('dedupes by post id (newer fetchedAt wins)', () => {
    let s = empty()
    s = upsertPosts(s, [
      {
        id: 'p1',
        text: 'a',
        url: 'https://x.com/i/status/p1',
        fetchedAt: 1,
        pinned: false,
        storyId: 's1',
      },
    ])
    s = upsertPosts(s, [
      {
        id: 'p1',
        text: 'b',
        url: 'https://x.com/i/status/p1',
        fetchedAt: 2,
        pinned: false,
        storyId: 's1',
      },
    ])
    expect(s.posts.p1?.text).toBe('b')
    expect(Object.keys(s.posts)).toHaveLength(1)
  })
})

describe('grepArchive', () => {
  it('finds substring in brief markdown', () => {
    let s = empty()
    s = upsertBrief(s, {
      id: 'b1',
      kind: 'rail',
      railId: 'sys-sphere',
      railLabel: 'Venice',
      query: 'q',
      markdown: 'Accelerating: uncensored models',
      model: 'grok',
      fetchedAt: Date.now(),
      pinned: false,
    })
    const hits = grepArchive(s, 'uncensored')
    expect(hits.some((h) => h.kind === 'brief' && h.id === 'b1')).toBe(true)
  })
})

describe('setPinned + listArchive', () => {
  it('pins a story and lists pinnedOnly', () => {
    let s = empty()
    s = upsertStory(s, {
      id: 's1',
      name: 'Story',
      clusterPostIds: [],
      fetchedAt: 100,
      pinned: false,
    })
    s = setPinned(s, 'story', 's1', true)
    expect(s.stories.s1?.pinned).toBe(true)
    const hits = listArchive(s, { pinnedOnly: true })
    expect(hits).toEqual([{ kind: 'story', id: 's1', snippet: 'Story' }])
  })
})
