import { describe, it, expect } from 'vitest'
import { buildTweetPayload, segmentHasContent } from './x-post-payload'

describe('segmentHasContent', () => {
  it('is false for empty segments', () => {
    expect(segmentHasContent({})).toBe(false)
    expect(segmentHasContent({ text: '   ' })).toBe(false)
    expect(segmentHasContent({ mediaIds: [] })).toBe(false)
  })

  it('is true for text, poll, or media', () => {
    expect(segmentHasContent({ text: 'hi' })).toBe(true)
    expect(segmentHasContent({ poll: { options: ['a', 'b'], durationMinutes: 60 } })).toBe(true)
    expect(segmentHasContent({ mediaIds: ['1'] })).toBe(true)
    expect(segmentHasContent({ text: '', mediaIds: ['1', '2'] })).toBe(true)
  })
})

describe('buildTweetPayload', () => {
  it('attaches media_ids when present', () => {
    expect(
      buildTweetPayload({ text: 'Photo', mediaIds: ['111', '222'] }, { first: true }),
    ).toEqual({
      text: 'Photo',
      media: { media_ids: ['111', '222'] },
    })
  })

  it('caps media_ids at 4', () => {
    const payload = buildTweetPayload(
      { text: 'x', mediaIds: ['1', '2', '3', '4', '5'] },
      { first: true },
    )
    expect(payload.media).toEqual({ media_ids: ['1', '2', '3', '4'] })
  })

  it('allows media-only posts', () => {
    expect(buildTweetPayload({ mediaIds: ['99'] }, { first: true })).toEqual({
      text: '',
      media: { media_ids: ['99'] },
    })
  })

  it('omits poll when media is present', () => {
    const payload = buildTweetPayload(
      {
        text: 'vote?',
        mediaIds: ['1'],
        poll: { options: ['a', 'b'], durationMinutes: 60 },
      },
      { first: true },
    )
    expect(payload.poll).toBeUndefined()
    expect(payload.media).toEqual({ media_ids: ['1'] })
  })

  it('includes poll when no media', () => {
    expect(
      buildTweetPayload(
        { text: 'vote?', poll: { options: ['a', 'b', 'c'], durationMinutes: 120 } },
        { first: true },
      ),
    ).toEqual({
      text: 'vote?',
      poll: { options: ['a', 'b', 'c'], duration_minutes: 120 },
    })
  })

  it('sets reply and first-segment flags', () => {
    expect(
      buildTweetPayload(
        { text: 'reply' },
        { first: true, inReplyTo: '42', replySettings: 'following', madeWithAi: true },
      ),
    ).toEqual({
      text: 'reply',
      reply: { in_reply_to_tweet_id: '42' },
      reply_settings: 'following',
      made_with_ai: true,
    })
  })
})
