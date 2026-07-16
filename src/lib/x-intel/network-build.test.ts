import { describe, it, expect } from 'vitest'
import { buildNetworkGraph, type BuildOptions, type SiblingSubject } from './network-build'
import type { Edge, Post, Profile } from './types'

const centerProfile = {
  id: '1',
  username: 'AskVenice',
  displayName: 'Ask Venice',
  avatarUrl: 'https://pbs.twimg.com/askvenice.jpg',
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

function edge(partial: Partial<Edge> & Pick<Edge, 'target' | 'kind'>): Edge {
  return {
    source: '1',
    targetUsername: '',
    weight: 1,
    lastSeen: '2026-07-01T00:00:00.000Z',
    ...partial,
  }
}

function post(partial: Partial<Post> & Pick<Post, 'id' | 'authorId'>): Post {
  return {
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
    gatheredAt: '2026-07-01T00:00:00.000Z',
    ...partial,
  }
}

const allKinds = () => new Set<Edge['kind']>(['mention', 'reply', 'quote', 'retweet'])

function build(edges: Edge[], opts: Partial<BuildOptions> = {}) {
  return buildNetworkGraph(centerProfile, edges, { kinds: allKinds(), topN: 25, ...opts })
}

describe('buildNetworkGraph aggregation', () => {
  it('collapses multiple kind-edges for the same account into one node', () => {
    const g = build([
      edge({ target: '10', targetUsername: 'alice', kind: 'mention', weight: 5 }),
      edge({ target: '10', targetUsername: 'alice', kind: 'reply', weight: 3, lastSeen: '2026-07-05T00:00:00.000Z' }),
      edge({ target: '10', targetUsername: 'alice', kind: 'quote', weight: 1 }),
    ])
    expect(g.nodes).toHaveLength(1)
    const n = g.nodes[0]
    expect(n.totalWeight).toBe(9)
    expect(n.byKind).toEqual({ mention: 5, reply: 3, quote: 1, retweet: 0 })
    expect(n.dominantKind).toBe('mention')
    expect(n.lastSeen).toBe('2026-07-05T00:00:00.000Z')
    expect(g.spokes).toHaveLength(1)
    expect(g.spokes[0].nodeId).toBe('10')
  })

  it('merges user: placeholder and resolved id for the same handle', () => {
    const g = build([
      edge({ target: 'user:alice', targetUsername: 'alice', kind: 'mention', weight: 2 }),
      edge({ target: '10', targetUsername: 'alice', kind: 'reply', weight: 1 }),
    ])
    expect(g.nodes).toHaveLength(1)
    expect(g.nodes[0].id).toBe('10')
    expect(g.nodes[0].totalWeight).toBe(3)
  })

  it('filters by kind before aggregating', () => {
    const g = build(
      [
        edge({ target: '10', targetUsername: 'alice', kind: 'mention', weight: 5 }),
        edge({ target: '10', targetUsername: 'alice', kind: 'retweet', weight: 9 }),
      ],
      { kinds: new Set(['mention']) },
    )
    expect(g.nodes[0].totalWeight).toBe(5)
    expect(g.nodes[0].byKind.retweet).toBe(0)
  })

  it('excludes self-loops (subject mentioning itself in reply threads)', () => {
    const g = build([
      edge({ target: '1', targetUsername: 'AskVenice', kind: 'mention', weight: 167 }),
      edge({ target: 'user:askvenice', targetUsername: 'askvenice', kind: 'reply', weight: 3 }),
      edge({ target: '10', targetUsername: 'alice', kind: 'mention', weight: 2 }),
    ])
    expect(g.nodes).toHaveLength(1)
    expect(g.nodes[0].username).toBe('alice')
  })

  it('counts unresolved post: placeholders instead of mapping them', () => {
    const g = build([
      edge({ target: 'post:12345', kind: 'quote', weight: 1 }),
      edge({ target: 'post:67890', kind: 'reply', weight: 2 }),
      edge({ target: '10', targetUsername: 'alice', kind: 'mention', weight: 1 }),
    ])
    expect(g.unresolvedCount).toBe(2)
    expect(g.nodes).toHaveLength(1)
  })
})

describe('buildNetworkGraph ranking and long tail', () => {
  it('ranks by totalWeight and caps at topN with a long-tail summary', () => {
    const edges: Edge[] = []
    for (let i = 0; i < 30; i++) {
      edges.push(edge({ target: String(100 + i), targetUsername: `u${i}`, kind: 'mention', weight: 30 - i }))
    }
    const g = build(edges, { topN: 10 })
    expect(g.nodes).toHaveLength(10)
    expect(g.nodes[0].username).toBe('u0')
    expect(g.nodes[0].rank).toBe(0)
    expect(g.nodes[9].username).toBe('u9')
    expect(g.longTailCount).toBe(20)
    // weights 20..1 cut
    expect(g.longTailWeight).toBe((20 * 21) / 2)
  })

  it('breaks weight ties by most recent lastSeen', () => {
    const g = build([
      edge({ target: '10', targetUsername: 'older', kind: 'mention', weight: 3, lastSeen: '2026-06-01T00:00:00.000Z' }),
      edge({ target: '11', targetUsername: 'newer', kind: 'mention', weight: 3, lastSeen: '2026-07-01T00:00:00.000Z' }),
    ], { topN: 1 })
    expect(g.nodes[0].username).toBe('newer')
  })
})

describe('buildNetworkGraph cross-links', () => {
  it('derives links from stored posts authored by a visible account mentioning another', () => {
    const edges = [
      edge({ target: '10', targetUsername: 'alice', kind: 'mention', weight: 5 }),
      edge({ target: '11', targetUsername: 'bob', kind: 'mention', weight: 4 }),
    ]
    const posts = [
      post({ id: 'p1', authorId: '10', mentions: [{ username: 'bob', id: '11' }, { username: 'AskVenice', id: '1' }] }),
      post({ id: 'p2', authorId: '10', mentions: [{ username: 'bob', id: '' }] }),
    ]
    const g = build(edges, { posts })
    expect(g.crossLinks).toHaveLength(1)
    expect(g.crossLinks[0]).toMatchObject({ a: '10', b: '11', weight: 2, source: 'posts' })
  })

  it('ignores posts authored by the center or by non-visible accounts', () => {
    const edges = [edge({ target: '10', targetUsername: 'alice', kind: 'mention', weight: 5 })]
    const posts = [
      post({ id: 'p1', authorId: '1', mentions: [{ username: 'alice', id: '10' }] }),
      post({ id: 'p2', authorId: '999', mentions: [{ username: 'alice', id: '10' }] }),
    ]
    const g = build(edges, { posts })
    expect(g.crossLinks).toHaveLength(0)
  })

  it('derives links from sibling subjects that are visible nodes', () => {
    const edges = [
      edge({ target: '10', targetUsername: 'alice', kind: 'mention', weight: 5 }),
      edge({ target: '11', targetUsername: 'bob', kind: 'mention', weight: 4 }),
    ]
    const siblings: SiblingSubject[] = [{
      id: '10',
      username: 'alice',
      avatarUrl: 'https://pbs.twimg.com/alice.jpg',
      edges: [
        edge({ source: '10', target: '11', targetUsername: 'bob', kind: 'reply', weight: 7 }),
        edge({ source: '10', target: '1', targetUsername: 'AskVenice', kind: 'mention', weight: 2 }),
        edge({ source: '10', target: '999', targetUsername: 'stranger', kind: 'mention', weight: 3 }),
      ],
    }]
    const g = build(edges, { siblings })
    expect(g.crossLinks).toHaveLength(1)
    expect(g.crossLinks[0]).toMatchObject({ a: '10', b: '11', weight: 7, source: 'sibling' })
    // sibling avatar propagates onto the node
    expect(g.nodes.find((n) => n.id === '10')?.avatarUrl).toBe('https://pbs.twimg.com/alice.jpg')
  })

  it('combines post-derived and sibling-derived weight on the same pair', () => {
    const edges = [
      edge({ target: '10', targetUsername: 'alice', kind: 'mention', weight: 5 }),
      edge({ target: '11', targetUsername: 'bob', kind: 'mention', weight: 4 }),
    ]
    const posts = [post({ id: 'p1', authorId: '10', mentions: [{ username: 'bob', id: '11' }] })]
    const siblings: SiblingSubject[] = [{
      id: '10', username: 'alice', avatarUrl: null,
      edges: [edge({ source: '10', target: '11', targetUsername: 'bob', kind: 'reply', weight: 4 })],
    }]
    const g = build(edges, { posts, siblings })
    expect(g.crossLinks).toHaveLength(1)
    expect(g.crossLinks[0].weight).toBe(5)
  })
})

describe('buildNetworkGraph center metadata', () => {
  it('exposes the center account with its avatar', () => {
    const g = build([edge({ target: '10', targetUsername: 'alice', kind: 'mention' })])
    expect(g.center).toEqual({ id: '1', username: 'AskVenice', avatarUrl: 'https://pbs.twimg.com/askvenice.jpg' })
  })
})
