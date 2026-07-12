import { resolveDraftFormat, type PreferredFormat } from './format'
import type { PostDraft } from './types'

// X pay-per-use blocks several actions on self-serve tiers, so not every draft
// can be posted through the API. This classifier decides whether the Post
// button posts natively or falls back to copy-to-X, and why.

export interface PostabilityCaps {
  /** Whether native media upload is wired (Phase 4 final task). */
  mediaNativeSupported: boolean
}

export interface Postability {
  mode: 'api' | 'copy'
  reason?: string
}

/** Extra signals that cannot be derived from the draft alone. */
export interface PostabilityContext {
  /**
   * Whether the reply target post summons the connected user (X PAYG rule:
   * author @mentioned you or quoted your post). `true` → API reply allowed.
   * `false` / `null` / omitted → copy-only for replies.
   */
  replySummoned?: boolean | null
}

const REPLY_REASON = 'Needs @mention or quote of you'
const REPLY_CHECKING_REASON = 'Checking if this post summons you…'
const QUOTE_REASON =
  'Quote-posts are not available via the X API on pay-per-use. Copy this to X to post it manually.'
const MEDIA_REASON =
  'Posting media through the API is not enabled yet. Copy this to X to post it manually.'

/**
 * Decide how a draft can be published. Articles post natively via the Articles
 * API (media uploaded inside that path). Originals (single or thread) post
 * natively; replies post natively only when the target post summons you
 * (mention/quote of you — not merely a follower); quotes are copy-only per X
 * PAYG rules; segment media routes to copy until native upload is enabled.
 */
const ARTICLE_UNVERIFIED_REASON =
  'Articles require a verified X account — Copy to X for now.'

export function classifyPostability(
  draft: PostDraft,
  caps: PostabilityCaps,
  preferredFormat?: PreferredFormat,
  isVerified?: boolean,
  ctx?: PostabilityContext,
): Postability {
  if (preferredFormat === 'article' || resolveDraftFormat(draft) === 'article') {
    if (isVerified === false) {
      return { mode: 'copy', reason: ARTICLE_UNVERIFIED_REASON }
    }
    return { mode: 'api' }
  }
  if (draft.target.kind === 'reply') {
    if (ctx?.replySummoned === true) return { mode: 'api' }
    if (ctx?.replySummoned == null) return { mode: 'copy', reason: REPLY_CHECKING_REASON }
    return { mode: 'copy', reason: REPLY_REASON }
  }
  if (draft.target.kind === 'quote') return { mode: 'copy', reason: QUOTE_REASON }

  const hasMedia = draft.segments.some((s) => s.media.length > 0)
  if (hasMedia && !caps.mediaNativeSupported) return { mode: 'copy', reason: MEDIA_REASON }

  return { mode: 'api' }
}
