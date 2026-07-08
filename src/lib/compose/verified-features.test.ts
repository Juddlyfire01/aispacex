import { describe, it, expect } from 'vitest'
import {
  effectiveLongform,
  filterReplySettingOptions,
  isVerifiedProfile,
  prepareDraftForPost,
  syncDraftForVerification,
  applyLongformPreference,
} from './verified-features'
import type { Profile } from '../x-intel/types'
import { emptyDraft } from './types'

function profile(verifiedType: Profile['verified']['type']): Profile {
  return {
    id: '1',
    username: 'user',
    displayName: 'User',
    verified: { legacy: false, type: verifiedType },
    bio: null,
    bioUrls: [],
    website: null,
    location: null,
    url: null,
    avatarUrl: '',
    bannerUrl: null,
    automatedBy: null,
    pinnedPostId: null,
    mostRecentPostId: null,
    accountCreated: '2020-01-01T00:00:00Z',
    gatheredAt: '2020-01-01T00:00:00Z',
    metrics: { followers: 0, following: 0, posts: 0, likes: 0, listed: 0, media: 0 },
  }
}

describe('isVerifiedProfile', () => {
  it('is true for any verification type', () => {
    expect(isVerifiedProfile(profile('blue'))).toBe(true)
    expect(isVerifiedProfile(profile('business'))).toBe(true)
  })

  it('is false when unverified', () => {
    expect(isVerifiedProfile(profile(null))).toBe(false)
    expect(isVerifiedProfile(null)).toBe(false)
  })
})

describe('filterReplySettingOptions', () => {
  it('hides verified-only options for unverified accounts', () => {
    const values = filterReplySettingOptions(false).map((o) => o.value)
    expect(values).not.toContain('verified')
    expect(values).not.toContain('subscribers')
    expect(values).toContain('everyone')
  })

  it('shows all options for verified accounts', () => {
    const values = filterReplySettingOptions(true).map((o) => o.value)
    expect(values).toContain('verified')
    expect(values).toContain('subscribers')
  })
})

describe('effectiveLongform', () => {
  it('requires verification', () => {
    expect(effectiveLongform(true, true)).toBe(true)
    expect(effectiveLongform(true, false)).toBe(false)
  })
})

describe('syncDraftForVerification', () => {
  it('syncs longform to the persisted preference for verified accounts', () => {
    expect(syncDraftForVerification({ longform: false }, true, true)).toEqual({ longform: true })
    expect(syncDraftForVerification({ longform: true }, true, false)).toEqual({ longform: false })
    expect(syncDraftForVerification({ longform: false }, true, false)).toBeNull()
  })

  it('clears verified-only reply settings when not verified', () => {
    expect(
      syncDraftForVerification({ longform: true, replySettings: 'verified' }, false, true),
    ).toEqual({ replySettings: 'everyone' })
  })

  it('leaves longform alone when unverified', () => {
    expect(syncDraftForVerification({ longform: true }, false, false)).toBeNull()
  })

  it('leaves draft unchanged when verified and longform matches preference', () => {
    expect(
      syncDraftForVerification({ longform: true, replySettings: 'verified' }, true, true),
    ).toBeNull()
  })
})

describe('applyLongformPreference', () => {
  it('overrides AI longform when the user opted out', () => {
    expect(applyLongformPreference({ longform: true, segments: [] }, false)).toEqual({
      longform: false,
      segments: [],
    })
  })
})

describe('prepareDraftForPost', () => {
  it('clears verified-only reply settings before posting for unverified accounts', () => {
    const draft = { ...emptyDraft(), longform: true, replySettings: 'subscribers' as const }
    const prepared = prepareDraftForPost(draft, false)
    expect(prepared.longform).toBe(true)
    expect(prepared.replySettings).toBe('everyone')
  })
})
