import { resolveDraftFormat } from './format'
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

const REPLY_REASON =
  'X only allows programmatic replies when the author summoned you (@mentioned or quoted you). Copy this to X to post it manually.'
const QUOTE_REASON =
  'Quote-posts are not available via the X API on pay-per-use. Copy this to X to post it manually.'
const MEDIA_REASON =
  'Posting media through the API is not enabled yet. Copy this to X to post it manually.'
const ARTICLE_REASON =
  'Article publishing via X API lands next — Copy to X for now.'

/**
 * Decide how a draft can be published. Originals (single or thread) post
 * natively; replies and quotes are copy-only per X PAYG rules; any media
 * routes to copy until native upload is enabled. Articles are copy-only until
 * the Articles API path is wired.
 */
export function classifyPostability(draft: PostDraft, caps: PostabilityCaps): Postability {
  if (resolveDraftFormat(draft) === 'article') {
    return { mode: 'copy', reason: ARTICLE_REASON }
  }
  if (draft.target.kind === 'reply') return { mode: 'copy', reason: REPLY_REASON }
  if (draft.target.kind === 'quote') return { mode: 'copy', reason: QUOTE_REASON }

  const hasMedia = draft.segments.some((s) => s.media.length > 0)
  if (hasMedia && !caps.mediaNativeSupported) return { mode: 'copy', reason: MEDIA_REASON }

  return { mode: 'api' }
}
