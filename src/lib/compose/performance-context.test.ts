import { describe, it, expect } from 'vitest'
import {
  resolvePerformanceSubject,
  selectionFromSubject,
} from './performance-context'
import { makePost, makeProfile } from '../intel-library/test-fixtures'

describe('resolvePerformanceSubject', () => {
  const selfProfile = makeProfile('meuser')
  selfProfile.id = 'self-1'
  const selfPosts = [makePost({ id: 's1', authorId: 'self-1' })]
  const otherSelfProfile = makeProfile('altme')
  otherSelfProfile.id = 'self-2'
  const otherSelfPosts = [makePost({ id: 's2', authorId: 'self-2' })]
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

  const getSelfAccount = (accountId: string) => {
    if (accountId === 'acc-me') return selfAccount
    if (accountId === 'acc-alt') {
      return { profile: otherSelfProfile, posts: otherSelfPosts, edges: [] }
    }
    return null
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
      expect(r.selection).toEqual({ kind: 'target', username: 'target' })
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

  it('explicit me selection wins over thread target scope', () => {
    const r = resolvePerformanceSubject({
      selection: { kind: 'me', accountId: 'acc-alt' },
      threadScope: { type: 'target', username: 'target' },
      newThreadContext: { type: 'me' },
      selfAccount,
      getSelfAccount,
      findReport: (u) => (u === 'target' ? reports.target : null),
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.profile.username).toBe('altme')
      expect(r.selection).toEqual({ kind: 'me', accountId: 'acc-alt' })
    }
  })

  it('explicit target selection wins over me thread', () => {
    const r = resolvePerformanceSubject({
      selection: { kind: 'target', username: 'target' },
      threadScope: { type: 'me' },
      newThreadContext: { type: 'me' },
      selfAccount,
      findReport: (u) => (u === 'target' ? reports.target : null),
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.profile.username).toBe('target')
    }
  })
})

describe('selectionFromSubject', () => {
  it('maps self username to me selection', () => {
    const selfProfile = makeProfile('meuser')
    selfProfile.id = 'self-1'
    const subject = resolvePerformanceSubject({
      threadScope: { type: 'me' },
      newThreadContext: { type: 'me' },
      selfAccount: {
        profile: selfProfile,
        posts: [makePost({ id: 's1', authorId: 'self-1' })],
        edges: [],
      },
      findReport: () => null,
    })
    expect(
      selectionFromSubject(subject, [{ id: 'acc-1', username: 'meuser' }]),
    ).toEqual({ kind: 'me', accountId: 'acc-1' })
  })

  it('maps target to target selection', () => {
    const targetProfile = makeProfile('target')
    targetProfile.id = 't-1'
    const subject = resolvePerformanceSubject({
      threadScope: { type: 'target', username: 'target' },
      newThreadContext: { type: 'me' },
      selfAccount: null,
      findReport: () => ({
        profile: targetProfile,
        posts: [makePost({ id: 't1', authorId: 't-1' })],
      }),
    })
    expect(selectionFromSubject(subject, [])).toEqual({
      kind: 'target',
      username: 'target',
    })
  })
})
