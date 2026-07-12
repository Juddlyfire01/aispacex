// src/lib/x-intel/normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeProfile, normalizePost, deriveEdges, ensureProfileShape, profileNeedsLinkRefresh } from './normalize'
import type { XUserRaw, XPostRaw } from './types'

const rawUser: XUserRaw = {
  id: '42', name: 'Erik Voorhees', username: 'ErikVoorhees',
  verified: false, verified_type: 'blue',
  description: 'Building freedom tech', location: 'Earth',
  url: 'https://t.co/abc', profile_image_url: 'https://pbs.twimg.com/x.jpg',
  pinned_tweet_id: '900', most_recent_tweet_id: '999',
  created_at: '2011-04-01T00:00:00.000Z',
  public_metrics: { followers_count: 700000, following_count: 4499, tweet_count: 50000, listed_count: 5000, like_count: 30000, media_count: 1200 },
}

const rawPost: XPostRaw = {
  id: '999', text: 'gm @venice_ai builders', author_id: '42', lang: 'en',
  created_at: '2026-07-01T12:00:00.000Z',
  public_metrics: { impression_count: 10000, like_count: 500, retweet_count: 60, reply_count: 40, quote_count: 10, bookmark_count: 25 },
  referenced_tweets: [{ type: 'quoted', id: '888' }],
  entities: {
    urls: [{ expanded_url: 'https://venice.ai', display_url: 'venice.ai', title: 'Venice' }],
    mentions: [{ username: 'venice_ai', id: '77' }],
  },
  attachments: { media_keys: ['3_abc'] },
  context_annotations: [{ domain: { name: 'Technology' }, entity: { name: 'AI' } }],
}

describe('normalizeProfile', () => {
  it('maps raw user to Profile with verification type', () => {
    const p = normalizeProfile(rawUser)
    expect(p.id).toBe('42')
    expect(p.username).toBe('ErikVoorhees')
    expect(p.verified).toEqual({ legacy: false, type: 'blue' })
    expect(p.bannerUrl).toBeNull()
    expect(p.automatedBy).toBeNull()
    expect(p.metrics.followers).toBe(700000)
    expect(p.pinnedPostId).toBe('900')
    expect(p.mostRecentPostId).toBe('999')
    expect(p.gatheredAt).toBeTruthy()
    expect(p.bioUrls).toEqual([])
    expect(p.website).toEqual({ href: 'https://t.co/abc', display: 'https://t.co/abc' })
  })

  it('maps banner and automated affiliation from includes', () => {
    const p = normalizeProfile({
      ...rawUser,
      profile_banner_url: 'https://pbs.twimg.com/profile_banners/42/1',
      affiliation: { user_id: ['99'], description: 'Automated by @parent' },
    }, {
      users: [{ id: '99', name: 'Parent', username: 'parent' }],
    })
    expect(p.bannerUrl).toBe('https://pbs.twimg.com/profile_banners/42/1')
    expect(p.automatedBy).toEqual({ username: 'parent' })
  })

  it('skips org affiliation badges that ship badge_url', () => {
    const p = normalizeProfile({
      ...rawUser,
      affiliation: { user_id: ['99'], badge_url: 'https://pbs.twimg.com/badge.png' },
    }, {
      users: [{ id: '99', name: 'Org', username: 'org' }],
    })
    expect(p.automatedBy).toBeNull()
  })

  it('maps description and profile url entities for condensed display', () => {
    const p = normalizeProfile({
      ...rawUser,
      description: 'Founder of https://t.co/iUPC8ij60f',
      url: 'https://t.co/site',
      entities: {
        description: {
          urls: [{
            url: 'https://t.co/iUPC8ij60f',
            expanded_url: 'https://venice.ai',
            display_url: 'Venice.ai',
            start: 11,
            end: 34,
          }],
        },
        url: {
          urls: [{ url: 'https://t.co/site', expanded_url: 'https://venice.ai', display_url: 'venice.ai' }],
        },
      },
    })
    expect(p.bioUrls).toEqual([
      { url: 'https://t.co/iUPC8ij60f', expanded: 'https://venice.ai', display: 'Venice.ai', start: 11, end: 34 },
    ])
    expect(p.website).toEqual({ href: 'https://t.co/site', display: 'venice.ai' })
  })

  it('ensureProfileShape backfills missing link fields on legacy profiles', () => {
    const legacy = normalizeProfile({ id: '1', name: 'x', username: 'x', verified_type: 'none' })
    const shaped = ensureProfileShape({ ...legacy, bioUrls: undefined as unknown as [], website: undefined as unknown as null })
    expect(shaped.bioUrls).toEqual([])
    expect(shaped.website).toBeNull()
  })

  it('profileNeedsLinkRefresh detects stale cached profiles with t.co in bio', () => {
    const stale = ensureProfileShape({
      ...normalizeProfile({ id: '1', name: 'x', username: 'x', description: 'see https://t.co/abc', verified_type: 'none' }),
      bioUrls: [],
    })
    expect(profileNeedsLinkRefresh(stale)).toBe(true)
  })

  it('treats verified_type "none" and missing fields as nulls/zeros', () => {
    const p = normalizeProfile({ id: '1', name: 'x', username: 'x', verified_type: 'none' })
    expect(p.verified.type).toBeNull()
    expect(p.bio).toBeNull()
    expect(p.bioUrls).toEqual([])
    expect(p.website).toBeNull()
    expect(p.metrics.followers).toBe(0)
  })
})

describe('normalizePost', () => {
  it('maps raw post to Post with derived kind', () => {
    const p = normalizePost(rawPost)
    expect(p.kind).toBe('quote')
    expect(p.metrics.likes).toBe(500)
    expect(p.mentions).toEqual([{ username: 'venice_ai', id: '77' }])
    expect(p.mediaKeys).toEqual(['3_abc'])
    expect(p.contextAnnotations).toEqual([{ domain: 'Technology', entity: 'AI' }])
  })

  it('derives kind for reply, retweet, original', () => {
    expect(normalizePost({ ...rawPost, referenced_tweets: [{ type: 'replied_to', id: '1' }] }).kind).toBe('reply')
    expect(normalizePost({ ...rawPost, referenced_tweets: [{ type: 'retweeted', id: '1' }] }).kind).toBe('retweet')
    expect(normalizePost({ ...rawPost, referenced_tweets: [{ type: 'reposted', id: '1' }] }).kind).toBe('retweet')
    expect(normalizePost({ ...rawPost, referenced_tweets: undefined }).kind).toBe('original')
  })

  it('stores in_reply_to_user_id for inbound reply detection', () => {
    const p = normalizePost({
      ...rawPost,
      author_id: '99',
      in_reply_to_user_id: '42',
      referenced_tweets: [{ type: 'replied_to', id: '1' }],
    })
    expect(p.inReplyToUserId).toBe('42')
    expect(p.kind).toBe('reply')
  })

  it('resolves referenced authors from includes', () => {
    const p = normalizePost(rawPost, {
      tweets: [{ id: '888', text: 'hi', author_id: '77' }],
      users: [{ id: '77', name: 'Venice', username: 'venice_ai' }],
    })
    expect(p.referenced[0]).toEqual({
      id: '888', type: 'quoted', authorId: '77', authorUsername: 'venice_ai',
    })
  })

  it('uses note_tweet for long-form post text and entities', () => {
    const truncated = '1. DeepSeek 2. Perplexity 3. Suno 4. Polymarket 5. Gamma 6. ElevenLabs 7.…'
    const full = `${truncated.replace(/…$/, '')} 8. Cursor 9. Venice`
    const p = normalizePost({
      ...rawPost,
      text: truncated,
      note_tweet: {
        text: full,
        entities: {
          mentions: [{ username: 'deedydas', id: '55', start: 42, end: 51 }],
        },
      },
    })
    expect(p.text).toBe(full)
    expect(p.mentions).toEqual([{ username: 'deedydas', id: '55', start: 42, end: 51 }])
  })
})

describe('deriveEdges', () => {
  it('counts mention edges across posts and tracks lastSeen', () => {
    const p1 = normalizePost(rawPost)
    const p2 = normalizePost({ ...rawPost, id: '998', created_at: '2026-06-30T12:00:00.000Z' })
    const edges = deriveEdges('42', [p1, p2])
    const mention = edges.find((e) => e.kind === 'mention' && e.targetUsername === 'venice_ai')
    expect(mention).toBeDefined()
    expect(mention!.weight).toBe(2)
    expect(mention!.lastSeen).toBe('2026-07-01T12:00:00.000Z')
    expect(mention!.source).toBe('42')
  })

  it('creates quote/reply edges keyed to referenced post ids when author unknown', () => {
    const p = normalizePost(rawPost) // quoted post 888, author unknown; body mention is not a prefix
    const edges = deriveEdges('42', [p])
    const quote = edges.find((e) => e.kind === 'quote')
    expect(quote).toBeDefined()
    expect(quote!.target).toBe('post:888') // placeholder until resolved
    expect(quote!.targetUsername).toBe('')
  })

  it('does not count RT-echoed @mentions as deliberate mentions', () => {
    const p = normalizePost({
      ...rawPost,
      id: 'rt1',
      text: 'RT @deedydas: Top 20 Startups feat @EoghanH',
      referenced_tweets: [{ type: 'reposted', id: '777' }],
      entities: { mentions: [
        { username: 'deedydas', id: '99', start: 3, end: 12 },
        { username: 'EoghanH', id: 'e1', start: 35, end: 43 },
      ] },
    })
    const edges = deriveEdges('42', [p])
    expect(edges.find((e) => e.kind === 'mention')).toBeUndefined()
    const rt = edges.find((e) => e.kind === 'retweet')
    expect(rt).toBeDefined()
    // Fallback: first mention on an RT is the reposted author when includes are absent
    expect(rt!.targetUsername).toBe('deedydas')
    expect(rt!.target).toBe('99')
  })

  it('resolves retweet edges to the referenced author when includes are present', () => {
    const p = normalizePost({
      ...rawPost,
      id: 'rt2',
      text: 'RT @deedydas: hello',
      referenced_tweets: [{ type: 'reposted', id: '777' }],
      entities: { mentions: [{ username: 'deedydas', id: '99', start: 3, end: 12 }] },
    }, {
      tweets: [{ id: '777', text: 'hello', author_id: '99' }],
      users: [{ id: '99', name: 'DD', username: 'deedydas' }],
    })
    const edges = deriveEdges('42', [p])
    const rt = edges.find((e) => e.kind === 'retweet')
    expect(rt!.targetUsername).toBe('deedydas')
    expect(rt!.target).toBe('99')
    expect(edges.find((e) => e.kind === 'mention')).toBeUndefined()
  })

  it('strips reply thread-prefix @handles from mention edges', () => {
    const p = normalizePost({
      ...rawPost,
      id: 'r1',
      text: '@root @parent cc @venice_ai',
      referenced_tweets: [{ type: 'replied_to', id: '111' }],
      entities: { mentions: [
        { username: 'root', id: '1', start: 0, end: 5 },
        { username: 'parent', id: '2', start: 6, end: 13 },
        { username: 'venice_ai', id: '77', start: 17, end: 27 },
      ] },
    })
    const edges = deriveEdges('42', [p])
    expect(edges.filter((e) => e.kind === 'mention').map((e) => e.targetUsername)).toEqual(['venice_ai'])
    const reply = edges.find((e) => e.kind === 'reply')
    expect(reply!.targetUsername).toBe('root') // prefix fallback → person replied to
  })

  it('returns empty array for no posts', () => {
    expect(deriveEdges('42', [])).toEqual([])
  })

  it('updates lastSeen when a newer post is processed after an older one', () => {
    const older = normalizePost({ ...rawPost, id: '997', created_at: '2026-06-29T12:00:00.000Z' })
    const newer = normalizePost({ ...rawPost, id: '998', created_at: '2026-07-02T12:00:00.000Z' })
    const edges = deriveEdges('42', [older, newer]) // oldest first → update branch fires
    const mention = edges.find((e) => e.kind === 'mention' && e.targetUsername === 'venice_ai')
    expect(mention!.lastSeen).toBe('2026-07-02T12:00:00.000Z')
  })

  it('upgrades a placeholder mention target to a real id when one arrives later', () => {
    const noId = normalizePost({ ...rawPost, id: 'a', entities: { mentions: [{ username: 'venice_ai' }] } })
    const withId = normalizePost({ ...rawPost, id: 'b', entities: { mentions: [{ username: 'venice_ai', id: '77' }] } })
    const edges = deriveEdges('42', [noId, withId]) // placeholder first, then real id
    const mention = edges.find((e) => e.kind === 'mention' && e.targetUsername === 'venice_ai')
    expect(mention!.target).toBe('77') // upgraded from user:venice_ai
  })
})
