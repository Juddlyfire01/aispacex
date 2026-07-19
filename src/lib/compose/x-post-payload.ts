/** Shared pure helpers for the X post write path (client body + server payload). */

export interface SegmentInput {
  text?: string
  poll?: { options?: string[]; durationMinutes?: number }
  mediaIds?: string[]
}

export function segmentHasContent(seg: SegmentInput): boolean {
  return (
    (seg.text ?? '').trim() !== '' ||
    Boolean(seg.poll?.options && seg.poll.options.length >= 2) ||
    Boolean(seg.mediaIds && seg.mediaIds.length > 0)
  )
}

export function buildTweetPayload(
  seg: SegmentInput,
  opts: { first: boolean; inReplyTo?: string; replySettings?: string; madeWithAi?: boolean },
): Record<string, unknown> {
  const payload: Record<string, unknown> = { text: seg.text ?? '' }

  const mediaIds = (seg.mediaIds ?? []).filter(Boolean).slice(0, 4)
  if (mediaIds.length > 0) {
    payload.media = { media_ids: mediaIds }
  }

  if (seg.poll?.options && seg.poll.options.length >= 2 && mediaIds.length === 0) {
    payload.poll = {
      options: seg.poll.options.slice(0, 4),
      duration_minutes: seg.poll.durationMinutes ?? 1440,
    }
  }
  if (opts.inReplyTo) {
    payload.reply = { in_reply_to_tweet_id: opts.inReplyTo }
  }
  if (opts.first) {
    if (opts.replySettings && opts.replySettings !== 'everyone') {
      payload.reply_settings = opts.replySettings
    }
    if (opts.madeWithAi) payload.made_with_ai = true
  }
  return payload
}
