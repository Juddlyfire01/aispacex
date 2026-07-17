import type { Profile } from '../x-intel/types'
import type { PostDraft, ReplySettings } from './types'

export const REPLY_SETTING_OPTIONS: {
  value: ReplySettings
  label: string
  requiresVerified?: boolean
}[] = [
  { value: 'everyone', label: 'Everyone can reply' },
  { value: 'following', label: 'Accounts you follow' },
  { value: 'mentionedUsers', label: 'Only mentioned' },
  { value: 'subscribers', label: 'Subscribers', requiresVerified: true },
  { value: 'verified', label: 'Verified accounts', requiresVerified: true },
]

const VERIFIED_ONLY_REPLY = new Set<ReplySettings>(['verified', 'subscribers'])

export function isVerifiedProfile(profile: Profile | null | undefined): boolean {
  return Boolean(profile?.verified.type)
}

export function filterReplySettingOptions(isVerified: boolean) {
  return REPLY_SETTING_OPTIONS.filter((opt) => !opt.requiresVerified || isVerified)
}

/** Long-form is only active when the connected account is verified. */
export function effectiveLongform(draftLongform: boolean, isVerified: boolean): boolean {
  return isVerified && draftLongform
}

/**
 * Resolve whether the editor should use the long-form (25k) limit.
 * Either the `longform` draft flag OR the `longform` preferred-format pill
 * enables it, so the two controls stay in sync. Still gated by verification.
 */
export function resolveLongform(
  draftLongform: boolean,
  preferredFormat: string,
  isVerified: boolean,
): boolean {
  return isVerified && (draftLongform || preferredFormat === 'longform')
}

export function syncDraftForVerification(
  draft: Partial<Pick<PostDraft, 'longform' | 'replySettings'>>,
  isVerified: boolean,
  longformPreference = true,
): Partial<Pick<PostDraft, 'longform' | 'replySettings'>> | null {
  const patch: Partial<Pick<PostDraft, 'longform' | 'replySettings'>> = {}

  if (isVerified && draft.longform !== longformPreference) {
    patch.longform = longformPreference
  }

  if (
    !isVerified &&
    draft.replySettings &&
    VERIFIED_ONLY_REPLY.has(draft.replySettings)
  ) {
    patch.replySettings = 'everyone'
  }

  return Object.keys(patch).length > 0 ? patch : null
}

/** Clamp AI draft longform to the user's persisted preference. */
export function applyLongformPreference<T extends { longform?: boolean }>(
  draft: T,
  longformPreference: boolean,
): T {
  if (typeof draft.longform !== 'boolean') return draft
  if (draft.longform === longformPreference) return draft
  return { ...draft, longform: longformPreference }
}

export function prepareDraftForPost(
  draft: PostDraft,
  isVerified: boolean,
  longformPreference = true,
): PostDraft {
  const patch = syncDraftForVerification(draft, isVerified, longformPreference)
  return patch ? { ...draft, ...patch } : draft
}
