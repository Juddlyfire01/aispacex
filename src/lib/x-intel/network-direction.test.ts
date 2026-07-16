import { describe, it, expect } from 'vitest'
import { buildNetworkFromPosts, outboundEdges, inboundEdges } from './network-direction'
import type { Post, Profile } from './types'

const SUBJECT_ID = 'erik'
const SUBJECT_HANDLE = 'ErikVoorhees'

const profile = {
  id: SUBJECT_ID,
  username: SUBJECT_HANDLE,
  displayName: 'Erik',
  avatarUrl: '',
  bannerUrl: null,
  bio: null,
  bioUrls: [],
  website: null,
  location: null,
  url: null,
  verified: { legacy: false, type: null },
  automatedBy: null,
  affiliation: null,
  metrics: { followers: 0, following: 0, posts: 0, likes: 0, listed: 0, media: 0 },
  accountCreated: '2020-01-01T00:00:00.000Z',
  pinnedPostId: null,
  mostRecentPostId: null,
  connectionStatus: null,
  followsYou: null,
  gatheredAt: '2026-07-11T00:00:00.000Z',
} satisfies Profile

function post(partial: Partial<Post> & Pick<Post, 'id' | 'authorId'>): Post {
  return {
    authorUsername: partial.authorId === SUBJECT_ID ? SUBJECT_HANDLE : '',
    text: '',
    lang: 'en',
    createdAt: '2026-07-01T00:00:00.000Z',
    metrics: { impressions: 0, likes: 0, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
    kind: 'original',
    referenced: [],
    urls: [],
    mentions: [],
    mediaKeys: [],
    contextAnnotations: [],
    gatheredAt: '2026-07-11T00:00:00.000Z',
    ...partial,
  }
}

describe('buildNetworkFromPosts outbound', () => {
  it('lists accounts the subject engaged, not people who engaged them', () => {
    const posts: Post[] = [
      post({ id: '1', authorId: SUBJECT_ID, mentions: [{ username: 'alice', id: 'a1' }] }),
      // Inbound RT of Erik by eoghanh — must NOT appear in outbound
      post({
        id: '2',
        authorId: 'e1',
        authorUsername: 'EoghanH',
        kind: 'retweet',
        referenced: [{ id: 'r0', type: 'reposted', authorId: SUBJECT_ID, authorUsername: SUBJECT_HANDLE }],
        mentions: [{ username: SUBJECT_HANDLE, id: SUBJECT_ID }],
      }),
    ]
    const model = buildNetworkFromPosts(profile, posts, {
      direction: 'outbound',
      kinds: new Set(['mention', 'reply', 'quote', 'retweet']),
      topN: 25,
    })
    expect(model.nodes.map((n) => n.username)).toEqual(['alice'])
    expect(model.nodes[0]?.sourcePostIds).toEqual(['1'])
  })

  it('does not attribute RT-echoed mentions as deliberate outbound mentions', () => {
    const posts: Post[] = [
      post({
        id: 'rt1',
        authorId: SUBJECT_ID,
        kind: 'retweet',
        text: 'RT @deedydas: hello @EoghanH',
        referenced: [{ id: '777', type: 'reposted', authorId: '99', authorUsername: 'deedydas' }],
        mentions: [
          { username: 'deedydas', id: '99', start: 3, end: 12 },
          { username: 'EoghanH', id: 'e1', start: 20, end: 28 },
        ],
      }),
    ]
    const model = buildNetworkFromPosts(profile, posts, {
      direction: 'outbound',
      kinds: new Set(['mention', 'reply', 'quote', 'retweet']),
      topN: 25,
    })
    expect(model.nodes.map((n) => n.username)).toEqual(['deedydas'])
    expect(model.nodes[0].dominantKind).toBe('retweet')
    expect(model.nodes.find((n) => n.username.toLowerCase() === 'eoghanh')).toBeUndefined()
  })

  it('attributes a reply to the referenced author, not every prefix handle', () => {
    const posts: Post[] = [
      post({
        id: 'r1',
        authorId: SUBJECT_ID,
        kind: 'reply',
        text: '@alice @bob cc @venice_ai',
        referenced: [{ id: '111', type: 'replied_to', authorId: 'a1', authorUsername: 'alice' }],
        mentions: [
          { username: 'alice', id: 'a1', start: 0, end: 6 },
          { username: 'bob', id: 'b1', start: 7, end: 11 },
          { username: 'venice_ai', id: '77', start: 15, end: 25 },
        ],
      }),
    ]
    const model = buildNetworkFromPosts(profile, posts, {
      direction: 'outbound',
      kinds: new Set(['mention', 'reply', 'quote', 'retweet']),
      topN: 25,
    })
    const byUser = Object.fromEntries(model.nodes.map((n) => [n.username, n.byKind]))
    expect(byUser.alice).toEqual({ mention: 0, reply: 1, quote: 0, retweet: 0 })
    expect(byUser.venice_ai).toEqual({ mention: 1, reply: 0, quote: 0, retweet: 0 })
    // bob is thread-prefix only — not a deliberate mention, not the reply target
    expect(byUser.bob).toBeUndefined()
  })
})

describe('buildNetworkFromPosts inbound', () => {
  it('lists authors who engaged the subject (same Edge polarity as outbound)', () => {
    const posts: Post[] = [
      post({ id: '1', authorId: SUBJECT_ID, mentions: [{ username: 'alice', id: 'a1' }] }),
      post({
        id: '2',
        authorId: 'e1',
        authorUsername: 'EoghanH',
        kind: 'retweet',
        referenced: [{ id: 'r0', type: 'reposted', authorId: SUBJECT_ID, authorUsername: SUBJECT_HANDLE }],
        mentions: [{ username: SUBJECT_HANDLE, id: SUBJECT_ID }],
      }),
    ]
    const model = buildNetworkFromPosts(profile, posts, {
      direction: 'inbound',
      kinds: new Set(['mention', 'reply', 'quote', 'retweet']),
      topN: 25,
    })
    expect(model.nodes.map((n) => n.username)).toEqual(['EoghanH'])
    expect(model.nodes[0].dominantKind).toBe('retweet')
  })

  it('is empty when inbound authors lack handles (legacy gathers) but counts them unresolved', () => {
    const posts: Post[] = [
      post({
        id: '2',
        authorId: 'e1',
        authorUsername: '',
        mentions: [{ username: SUBJECT_HANDLE, id: SUBJECT_ID }],
      }),
    ]
    const model = buildNetworkFromPosts(profile, posts, {
      direction: 'inbound',
      kinds: new Set(['mention', 'reply', 'quote', 'retweet']),
      topN: 25,
    })
    expect(model.nodes).toEqual([])
    expect(model.unresolvedCount).toBeGreaterThan(0)
  })

  it('resolves inbound author handles from the author directory', () => {
    const posts: Post[] = [
      post({
        id: '2',
        authorId: 'e1',
        authorUsername: '',
        mentions: [{ username: SUBJECT_HANDLE, id: SUBJECT_ID }],
      }),
    ]
    const model = buildNetworkFromPosts(profile, posts, {
      direction: 'inbound',
      kinds: new Set(['mention', 'reply', 'quote', 'retweet']),
      topN: 25,
      authorDirectory: new Map([['e1', { username: 'EoghanH' }]]),
    })
    expect(model.nodes.map((n) => n.username)).toEqual(['EoghanH'])
  })
})

describe('legacy helpers', () => {
  it('outboundEdges excludes inbound posts', () => {
    const posts: Post[] = [
      post({ id: '1', authorId: SUBJECT_ID, mentions: [{ username: 'alice', id: 'a1' }] }),
      post({ id: '2', authorId: 'e1', authorUsername: 'EoghanH', mentions: [{ username: SUBJECT_HANDLE, id: SUBJECT_ID }] }),
    ]
    const edges = outboundEdges(SUBJECT_ID, posts)
    expect(edges).toHaveLength(1)
    expect(edges[0].targetUsername).toBe('alice')
  })

  it('inboundEdges attributes engagement to the author, with subject as source for the graph builder', () => {
    const posts: Post[] = [
      post({
        id: '2',
        authorId: 'e1',
        authorUsername: 'EoghanH',
        referenced: [{ id: 'r0', type: 'reposted' }],
        mentions: [{ username: SUBJECT_HANDLE, id: SUBJECT_ID }],
      }),
    ]
    const edges = inboundEdges(SUBJECT_ID, SUBJECT_HANDLE, posts)
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe(SUBJECT_ID) // graph-builder polarity
    expect(edges[0].targetUsername).toBe('EoghanH')
    expect(edges[0].kind).toBe('retweet')
  })
})
