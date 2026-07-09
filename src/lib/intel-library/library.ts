import type {
  ComposeScope,
  IntelSnapshot,
  LibraryCounts,
  LibrarySubject,
  SubjectSummary,
} from './types'

function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, '').toLowerCase()
}

export function subjectsInScope(snap: IntelSnapshot, scope: ComposeScope): LibrarySubject[] {
  switch (scope.type) {
    case 'all':
      return snap.subjects
    case 'me':
      return snap.subjects.filter((s) => s.kind === 'self')
    case 'target': {
      const want = normalizeHandle(scope.username)
      return snap.subjects.filter(
        (s) => s.kind === 'target' && normalizeHandle(s.username) === want,
      )
    }
  }
}

export function listSubjects(snap: IntelSnapshot, scope: ComposeScope): SubjectSummary[] {
  return subjectsInScope(snap, scope).map((s) => ({
    kind: s.kind,
    username: s.username,
    postCount: s.posts.length,
    reportCount: s.reports.length,
    hasProfile: Boolean(s.profile),
    refreshedAt: s.refreshedAt ?? null,
  }))
}

export function libraryCounts(snap: IntelSnapshot, scope: ComposeScope): LibraryCounts {
  const subjects = subjectsInScope(snap, scope)
  return {
    subjects: subjects.length,
    posts: subjects.reduce((n, s) => n + s.posts.length, 0),
    reports: subjects.reduce((n, s) => n + s.reports.length, 0),
    bookmarks: subjects.reduce((n, s) => n + s.bookmarks.length, 0),
    likes: subjects.reduce((n, s) => n + s.likes.length, 0),
  }
}

export function getSubject(
  snap: IntelSnapshot,
  scope: ComposeScope,
  handle: string,
): LibrarySubject | null {
  const want = normalizeHandle(handle)
  return subjectsInScope(snap, scope).find((s) => normalizeHandle(s.username) === want) ?? null
}
