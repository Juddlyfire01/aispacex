import { describe, it, expect } from 'vitest'
import {
  explicitOutboundMentions,
  leadingMentionUsernames,
  matchesFeedFilters,
  postFeedFilterKeys,
  threadPrefixMentions,
} from './activity'
import type { Post, Profile } from './types'

const profile: Profile = {
  id: '1',
  username: 'ErikVoorhees',
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
  metrics: { followers: 0, following: 0, posts: 0, likes: 0, listed: 0, media: 0 },
  accountCreated: '',
  pinnedPostId: null,
  mostRecentPostId: null,
  gatheredAt: '',
}

function post(partial: Partial<Post> & Pick<Post, 'id'>): Post {
  return {
    authorId: '1',
    text: '',
    lang: 'en',
    createdAt: '2026-07-08T00:00:00Z',
    metrics: { impressions: 0, likes: 0, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
    kind: 'original',
    referenced: [],
    urls: [],
    mentions: [],
    mediaKeys: [],
    contextAnnotations: [],
    gatheredAt: '',
    ...partial,
  }
}

describe('leadingMentionUsernames', () => {
  it('parses a run of prefixed @handles', () => {
    expect(leadingMentionUsernames('@root @parent agreed')).toEqual(['root', 'parent'])
  })
})

describe('threadPrefixMentions', () => {
  it('uses entity spans for a reply-to-reply prefix', () => {
    const p = post({
      id: 'rttr',
      kind: 'reply',
      text: '@root @parent agreed',
      mentions: [
        { username: 'root', id: '1', start: 0, end: 5 },
        { username: 'parent', id: '2', start: 6, end: 13 },
      ],
    })
    expect(threadPrefixMentions(p).map((m) => m.username)).toEqual(['root', 'parent'])
    expect(explicitOutboundMentions(p)).toEqual([])
  })

  it('strips bare quote @author attribution', () => {
    const p = post({
      id: 'bare-quote',
      kind: 'quote',
      text: '@botblastcap https://t.co/JulpDz3vIK',
      mentions: [{ username: 'botblastcap', id: '99', start: 0, end: 12 }],
      referenced: [{ id: '888', type: 'quoted' }],
    })
    expect(explicitOutboundMentions(p)).toEqual([])
    expect(postFeedFilterKeys(profile, p)).toEqual(['quote'])
  })

  it('keeps in-body @mentions on quotes', () => {
    const p = post({
      id: 'quote-body',
      kind: 'quote',
      text: '@author huge — cc @venice_ai',
      mentions: [
        { username: 'author', id: '1', start: 0, end: 7 },
        { username: 'venice_ai', id: '77', start: 18, end: 28 },
      ],
      referenced: [{ id: '888', type: 'quoted' }],
    })
    expect(explicitOutboundMentions(p).map((m) => m.username)).toEqual(['venice_ai'])
  })

  it('stops the prefix at the first non-leading mention', () => {
    const p = post({
      id: 'body',
      kind: 'reply',
      text: '@root @parent cc @venice_ai',
      mentions: [
        { username: 'root', id: '1', start: 0, end: 5 },
        { username: 'parent', id: '2', start: 6, end: 13 },
        { username: 'venice_ai', id: '77', start: 17, end: 27 },
      ],
    })
    expect(explicitOutboundMentions(p)).toEqual([{ username: 'venice_ai', id: '77', start: 17, end: 27 }])
  })

  it('falls back to text parsing when spans are missing', () => {
    const p = post({
      id: 'legacy',
      kind: 'reply',
      text: '@op_user sounds good',
      mentions: [{ username: 'op_user', id: '10' }],
    })
    expect(explicitOutboundMentions(p)).toEqual([])
  })

  it('ignores RT @author attribution mentions', () => {
    const p = post({
      id: 'rt',
      kind: 'retweet',
      text: 'RT @deedydas: Top 20 Startups…',
      mentions: [{ username: 'deedydas', id: '99', start: 3, end: 12 }],
    })
    expect(explicitOutboundMentions(p)).toEqual([])
    expect(postFeedFilterKeys(profile, p)).toEqual(['retweet'])
  })
})

describe('postFeedFilterKeys', () => {
  it('tags inbound posts as mention-in only', () => {
    expect(postFeedFilterKeys(profile, post({ id: 'a', authorId: '99' }))).toEqual(['mention-in'])
  })

  it('tags authored posts with their kind', () => {
    expect(postFeedFilterKeys(profile, post({ id: 'b', kind: 'reply' }))).toEqual(['reply'])
  })

  it('does not tag prefixed reply @mentions as mention-out', () => {
    expect(postFeedFilterKeys(profile, post({
      id: 'r1',
      kind: 'reply',
      text: '@someone agreed',
      mentions: [{ username: 'someone', id: '99', start: 0, end: 8 }],
    }))).toEqual(['reply'])
  })

  it('tags in-body @mentions on replies as mention-out', () => {
    expect(postFeedFilterKeys(profile, post({
      id: 'r2',
      kind: 'reply',
      text: '@op_user agreed, cc @venice_ai',
      mentions: [
        { username: 'op_user', id: '10', start: 0, end: 8 },
        { username: 'venice_ai', id: '77', start: 20, end: 30 },
      ],
    }))).toEqual(['reply', 'mention-out'])
  })

  it('does not tag reply-to-reply prefixes as mention-out', () => {
    expect(postFeedFilterKeys(profile, post({
      id: 'r3',
      kind: 'reply',
      text: '@root @parent I agree',
      mentions: [
        { username: 'root', id: '1', start: 0, end: 5 },
        { username: 'parent', id: '2', start: 6, end: 13 },
      ],
    }))).toEqual(['reply'])
  })

  it('adds mention-out when the target @mentions someone on a non-reply', () => {
    expect(postFeedFilterKeys(profile, post({
      id: 'c',
      mentions: [{ username: 'venice_ai', id: '77' }],
    }))).toEqual(['original', 'mention-out'])
  })
})

describe('matchesFeedFilters', () => {
  it('matches when any post tag is selected', () => {
    const p = post({ id: 'c', mentions: [{ username: 'a', id: '1' }] })
    expect(matchesFeedFilters(profile, p, new Set(['mention-out']))).toBe(true)
    expect(matchesFeedFilters(profile, p, new Set(['retweet']))).toBe(false)
  })
})
