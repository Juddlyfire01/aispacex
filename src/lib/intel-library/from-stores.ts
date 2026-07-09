import type { SelfAccount, SelfSectionsRefreshed } from '../../stores/x-self-store'
import type { IntelReport, RefreshedAt } from '../../stores/x-intel-store'
import type { IntelSnapshot, LibrarySubject } from './types'

function isEmptySelf(account: SelfAccount): boolean {
  return !account.profile && account.posts.length === 0 && account.bookmarks.length === 0
}

function isEmptyTarget(report: IntelReport): boolean {
  return !report.profile && report.posts.length === 0
}

function pickSelfRefreshedAt(refreshedAt: SelfSectionsRefreshed): string | undefined {
  return refreshedAt.posts ?? refreshedAt.profile ?? refreshedAt.bookmarks ?? refreshedAt.likes
}

function pickTargetRefreshedAt(refreshedAt: RefreshedAt): string | undefined {
  return refreshedAt.feed ?? refreshedAt.profile ?? refreshedAt.network
}

function selfToSubject(account: SelfAccount): LibrarySubject {
  return {
    kind: 'self',
    id: account.id,
    username: account.username,
    profile: account.profile,
    posts: account.posts,
    bookmarks: account.bookmarks,
    likes: account.likes,
    edges: account.edges,
    reports: account.reportHistory ?? [],
    refreshedAt: pickSelfRefreshedAt(account.refreshedAt),
  }
}

function targetToSubject(report: IntelReport): LibrarySubject {
  return {
    kind: 'target',
    id: report.profile?.id ?? report.username,
    username: report.username,
    profile: report.profile,
    posts: report.posts,
    bookmarks: [],
    likes: [],
    edges: report.edges,
    reports: report.reportHistory ?? [],
    refreshedAt: pickTargetRefreshedAt(report.refreshedAt),
  }
}

export function buildIntelSnapshot(input: {
  selfAccounts: SelfAccount[]
  reports: IntelReport[]
}): IntelSnapshot {
  const subjects: LibrarySubject[] = []

  for (const account of input.selfAccounts) {
    if (isEmptySelf(account)) continue
    subjects.push(selfToSubject(account))
  }

  for (const report of input.reports) {
    if (isEmptyTarget(report)) continue
    subjects.push(targetToSubject(report))
  }

  return { subjects }
}
