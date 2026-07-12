import { describe, it, expect } from 'vitest'
import { resolvePerformanceSubject } from './performance-context'
import { makePost, makeProfile } from '../intel-library/test-fixtures'

describe('resolvePerformanceSubject', () => {
  const selfProfile = makeProfile('meuser')
  selfProfile.id = 'self-1'
  const selfPosts = [makePost({ id: 's1', authorId: 'self-1' })]
  const targetProfile = makeProfile('target')
  targetProfile.id = 't-1'
  const targetPosts = [
    makePost({ id: 't1', authorId: 't-1' }),
    makePost({ id: 'in', authorId: 'other', authorUsername: 'fan' }),
  ]

  const selfAccount = {
    profile: selfProfile,
    posts: selfPosts,
    edges: [],
  }

  const reports: Record<string, { profile: typeof targetProfile; posts: typeof targetPosts }> = {
    target: { profile: targetProfile, posts: targetPosts },
  }

  it('prefers active thread me scope', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'me' },
      newThreadContext: { type: 'all' },
      selfAccount,
      findReport: () => null,
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.profile.username).toBe('meuser')
      expect(r.ownPosts).toHaveLength(1)
    }
  })

  it('uses target thread scope', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'target', username: 'target' },
      newThreadContext: { type: 'me' },
      selfAccount,
      findReport: (u) => (u === 'target' ? reports.target : null),
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.profile.username).toBe('target')
      expect(r.ownPosts.every((p) => p.authorId === 't-1')).toBe(true)
      expect(r.inbound.length).toBe(1)
    }
  })

  it('falls back from all + self', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'all' },
      newThreadContext: { type: 'all' },
      selfAccount,
      findReport: () => null,
    })
    expect(r.status).toBe('ok')
  })

  it('empty when all and no self', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'all' },
      newThreadContext: { type: 'all' },
      selfAccount: null,
      findReport: () => null,
    })
    expect(r.status).toBe('need_profile')
  })

  it('empty library when profile but no posts', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'me' },
      newThreadContext: { type: 'me' },
      selfAccount: { profile: selfProfile, posts: [], edges: [] },
      findReport: () => null,
    })
    expect(r.status).toBe('no_posts')
  })
})
