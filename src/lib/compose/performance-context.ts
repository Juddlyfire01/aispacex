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

export type PerformanceSubjectOk = {
  status: 'ok'
  username: string
  profile: Profile
  ownPosts: Post[]
  inbound: Post[]
  edges: Edge[]
}

export type PerformanceSubjectResult =
  | PerformanceSubjectOk
  | { status: 'need_profile' }
  | { status: 'no_posts'; username: string }
  | { status: 'missing_target'; username: string }

export function resolvePerformanceSubject(opts: {
  threadScope: ComposeScope | null | undefined
  newThreadContext: ComposeScope
  selfAccount: SelfAccountSlice | null
  findReport: (username: string) => ReportSlice | null
}): PerformanceSubjectResult {
  const pickSelf = (): PerformanceSubjectResult => {
    const a = opts.selfAccount
    if (!a?.profile) return { status: 'need_profile' }
    const { own, inbound } = partitionPosts(a.profile, a.posts)
    if (a.posts.length === 0) return { status: 'no_posts', username: a.profile.username }
    return {
      status: 'ok',
      username: a.profile.username,
      profile: a.profile,
      ownPosts: own,
      inbound,
      edges: a.edges,
    }
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
    }
  }

  const tryScope = (scope: ComposeScope | null | undefined): PerformanceSubjectResult | null => {
    if (!scope) return null
    if (scope.type === 'me') return pickSelf()
    if (scope.type === 'target') return pickTarget(scope.username)
    return null // 'all' — try next
  }

  return (
    tryScope(opts.threadScope) ??
    tryScope(opts.newThreadContext) ??
    pickSelf()
  )
}
