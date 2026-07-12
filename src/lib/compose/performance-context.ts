import type { ComposeScope } from '../intel-library/types'
import { partitionPosts } from '../x-intel/activity'
import type { Edge, Post, Profile } from '../x-intel/types'

export type SelfAccountSlice = {
  profile: Profile | null
  posts: Post[]
  edges: Edge[]
}

export type ReportSlice = {
  profile: Profile
  posts: Post[]
  edges?: Edge[]
}

/** Explicit Performance profile pick (rail). Null = fall back to compose thread scope. */
export type PerformanceSelection =
  | { kind: 'me'; accountId: string }
  | { kind: 'target'; username: string }

export type PerformanceSubjectOk = {
  status: 'ok'
  username: string
  profile: Profile
  ownPosts: Post[]
  inbound: Post[]
  edges: Edge[]
  /** Which rail selection this maps to (for highlight). */
  selection: PerformanceSelection | null
}

export type PerformanceSubjectResult =
  | PerformanceSubjectOk
  | { status: 'need_profile' }
  | { status: 'no_posts'; username: string }
  | { status: 'missing_target'; username: string }

export function resolvePerformanceSubject(opts: {
  /** When set, wins over compose thread / new-thread context. */
  selection?: PerformanceSelection | null
  threadScope: ComposeScope | null | undefined
  newThreadContext: ComposeScope
  /** Active self account (fallback for `me` without a specific accountId). */
  selfAccount: SelfAccountSlice | null
  /** Resolve a specific connected self account by id (multi-account You). */
  getSelfAccount?: (accountId: string) => SelfAccountSlice | null
  findReport: (username: string) => ReportSlice | null
}): PerformanceSubjectResult {
  const pickSelfSlice = (
    slice: SelfAccountSlice | null,
    accountId: string | null,
  ): PerformanceSubjectResult => {
    if (!slice?.profile) return { status: 'need_profile' }
    const { own, inbound } = partitionPosts(slice.profile, slice.posts)
    if (slice.posts.length === 0) {
      return { status: 'no_posts', username: slice.profile.username }
    }
    return {
      status: 'ok',
      username: slice.profile.username,
      profile: slice.profile,
      ownPosts: own,
      inbound,
      edges: slice.edges,
      selection: accountId ? { kind: 'me', accountId } : null,
    }
  }

  const pickSelf = (accountId?: string): PerformanceSubjectResult => {
    if (accountId && opts.getSelfAccount) {
      return pickSelfSlice(opts.getSelfAccount(accountId), accountId)
    }
    return pickSelfSlice(opts.selfAccount, accountId ?? null)
  }

  const pickTarget = (username: string): PerformanceSubjectResult => {
    const handle = username.replace(/^@/, '')
    const report = opts.findReport(handle)
    if (!report) return { status: 'missing_target', username: handle }
    const { own, inbound } = partitionPosts(report.profile, report.posts)
    if (report.posts.length === 0) return { status: 'no_posts', username: handle }
    return {
      status: 'ok',
      username: handle,
      profile: report.profile,
      ownPosts: own,
      inbound,
      edges: report.edges ?? [],
      selection: { kind: 'target', username: handle },
    }
  }

  const tryScope = (scope: ComposeScope | null | undefined): PerformanceSubjectResult | null => {
    if (!scope) return null
    if (scope.type === 'me') return pickSelf()
    if (scope.type === 'target') return pickTarget(scope.username)
    return null // 'all' — try next
  }

  if (opts.selection) {
    if (opts.selection.kind === 'me') return pickSelf(opts.selection.accountId)
    return pickTarget(opts.selection.username)
  }

  return tryScope(opts.threadScope) ?? tryScope(opts.newThreadContext) ?? pickSelf()
}

/** Build a rail selection that matches a resolved subject (for highlight when selection is null). */
export function selectionFromSubject(
  subject: PerformanceSubjectResult,
  selfAccounts: { id: string; username: string }[],
): PerformanceSelection | null {
  if (subject.status === 'ok' && subject.selection) return subject.selection

  let username: string | null = null
  if (subject.status === 'ok') username = subject.username
  else if (subject.status === 'no_posts' || subject.status === 'missing_target') {
    username = subject.username
  }
  if (!username) return null

  const uname = username.toLowerCase()
  const self = selfAccounts.find((a) => a.username.toLowerCase() === uname)
  if (self) return { kind: 'me', accountId: self.id }
  return { kind: 'target', username }
}
