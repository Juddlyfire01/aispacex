import { describe, it, expect } from 'vitest'
import { postSummonsUser, type SelfIdentity } from './reply-eligibility'
import type { Post } from '../x-intel/types'

const ME: SelfIdentity = { id: 'me1', username: 'crypdjo' }

function post(partial: Partial<Post> & { id: string }): Post {
  return {
    authorId: 'other',
    authorUsername: 'erikvoorhees',
    text: '',
    lang: 'en',
    createdAt: '2026-07-12T00:00:00.000Z',
    metrics: { impressions: 0, likes: 0, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 },
    kind: 'original',
    referenced: [],
    urls: [],
    mentions: [],
    mediaKeys: [],
    contextAnnotations: [],
    gatheredAt: '2026-07-12T00:00:00.000Z',
    ...partial,
  }
}

describe('postSummonsUser', () => {
  it('detects entity @mention by user id', () => {
    expect(
      postSummonsUser(
        post({
          id: '1',
          mentions: [{ username: 'Crypdjo', id: 'me1' }],
          text: 'hey @Crypdjo',
        }),
        ME,
      ),
    ).toBe(true)
  })

  it('detects entity @mention by username (case-insensitive)', () => {
    expect(
      postSummonsUser(
        post({
          id: '2',
          mentions: [{ username: 'Crypdjo', id: '' }],
          text: 'hey',
        }),
        ME,
      ),
    ).toBe(true)
  })

  it('detects bare @handle in text when entities are missing', () => {
    expect(postSummonsUser(post({ id: '3', text: 'thoughts @crypdjo?' }), ME)).toBe(true)
  })

  it('detects quote of my post via referenced author id', () => {
    expect(
      postSummonsUser(
        post({
          id: '4',
          kind: 'quote',
          referenced: [{ id: 'q1', type: 'quoted', authorId: 'me1', authorUsername: 'crypdjo' }],
          text: 'interesting',
        }),
        ME,
      ),
    ).toBe(true)
  })

  it('does not treat a plain post as a summon', () => {
    expect(postSummonsUser(post({ id: '5', text: 'gm everyone' }), ME)).toBe(false)
  })

  it('does not treat mentioning someone else as a summon', () => {
    expect(
      postSummonsUser(
        post({
          id: '6',
          mentions: [{ username: 'venice_ai', id: '99' }],
          text: 'hey @venice_ai',
        }),
        ME,
      ),
    ).toBe(false)
  })

  it('does not match handle as a substring of another word', () => {
    expect(postSummonsUser(post({ id: '7', text: 'crypdjoish vibes' }), ME)).toBe(false)
  })
})
