import { describe, it, expect, beforeEach } from 'vitest'
import { useXAffiliatesStore, orgKey, VENICE_ORG, type AffiliateRoster } from './x-affiliates-store'
import type { Profile } from '../lib/x-intel/types'

function makeRoster(orgUsername: string, memberCount: number): AffiliateRoster {
  const members: Profile[] = Array.from({ length: memberCount }, (_, i) => ({
    id: String(i),
    username: `member${i}`,
    displayName: `Member ${i}`,
    avatarUrl: '',
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
    accountCreated: '',
    pinnedPostId: null,
    mostRecentPostId: null,
    connectionStatus: null,
    followsYou: null,
    gatheredAt: '',
  }))
  return {
    orgId: '999',
    orgUsername,
    orgName: orgUsername,
    members,
    fetchedAt: new Date().toISOString(),
  }
}

describe('orgKey', () => {
  it('lowercases and strips a leading @', () => {
    expect(orgKey('@AskVenice')).toBe('askvenice')
    expect(orgKey('  Stripe ')).toBe('stripe')
  })
})

describe('useXAffiliatesStore', () => {
  beforeEach(() => {
    useXAffiliatesStore.setState({ rosters: {} })
  })

  it('stores a roster keyed by lowercased org username', () => {
    useXAffiliatesStore.getState().setRoster(makeRoster('AskVenice', 3))
    expect(useXAffiliatesStore.getState().rosters['askvenice'].members).toHaveLength(3)
  })

  it('replaces an existing roster on refresh (case-insensitive key)', () => {
    useXAffiliatesStore.getState().setRoster(makeRoster('AskVenice', 3))
    useXAffiliatesStore.getState().setRoster(makeRoster('askvenice', 5))
    expect(Object.keys(useXAffiliatesStore.getState().rosters)).toEqual(['askvenice'])
    expect(useXAffiliatesStore.getState().rosters['askvenice'].members).toHaveLength(5)
  })

  it('removes a roster by org username', () => {
    useXAffiliatesStore.getState().setRoster(makeRoster('AskVenice', 3))
    useXAffiliatesStore.getState().removeRoster('@AskVenice')
    expect(useXAffiliatesStore.getState().rosters['askvenice']).toBeUndefined()
  })

  it('clears all rosters', () => {
    useXAffiliatesStore.getState().setRoster(makeRoster('AskVenice', 3))
    useXAffiliatesStore.getState().setRoster(makeRoster('Stripe', 2))
    useXAffiliatesStore.getState().clearAll()
    expect(useXAffiliatesStore.getState().rosters).toEqual({})
  })

  it('exposes the Venice org constant with the known id', () => {
    expect(VENICE_ORG.id).toBe('1764736490515685376')
    expect(orgKey(VENICE_ORG.username)).toBe('askvenice')
  })
})
