import type { Edge, IntelReportSnapshot, Post, Profile } from '../x-intel/types'
import type {
  ComposeScope,
  GrepHit,
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

export type GrepContentType = 'posts' | 'reports' | 'profiles' | 'edges' | 'all'

export interface GrepIntelOpts {
  query: string
  types?: GrepContentType[]
  handle?: string
  since?: string
  until?: string
  limit?: number
}

export interface GlobIntelEntry {
  path: string
  meta?: Record<string, unknown>
}

export interface GetPostsOpts {
  handle: string
  source?: 'posts' | 'bookmarks' | 'likes'
  since?: string
  until?: string
  kinds?: string[]
  ids?: string[]
  limit?: number
}

const SNIPPET_LEN = 200
const GREP_LIMIT_DEFAULT = 20
const GREP_LIMIT_MAX = 50
const POSTS_LIMIT_DEFAULT = 15
const POSTS_LIMIT_MAX = 40
const EDGES_LIMIT_DEFAULT = 20

function clampLimit(limit: number | undefined, def: number, max: number): number {
  if (limit == null || !Number.isFinite(limit)) return def
  return Math.max(0, Math.min(Math.floor(limit), max))
}

function queryTerms(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase())
}

function matchesAllTerms(haystack: string, terms: string[]): boolean {
  if (terms.length === 0) return false
  const lower = haystack.toLowerCase()
  return terms.every((t) => lower.includes(t))
}

function snippetAround(haystack: string, terms: string[]): string {
  const lower = haystack.toLowerCase()
  let idx = 0
  for (const t of terms) {
    const at = lower.indexOf(t)
    if (at >= 0) {
      idx = at
      break
    }
  }
  const half = Math.floor(SNIPPET_LEN / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(haystack.length, start + SNIPPET_LEN)
  let snip = haystack.slice(start, end)
  if (start > 0) snip = '…' + snip
  if (end < haystack.length) snip = snip + '…'
  return snip
}

function inDateRange(iso: string | undefined, since?: string, until?: string): boolean {
  if (!iso) return !(since || until)
  if (since && iso < since) return false
  if (until && iso > until) return false
  return true
}

function expandGrepTypes(types?: GrepContentType[]): Set<'posts' | 'reports' | 'profiles' | 'edges'> {
  const raw = types?.length ? types : (['all'] as GrepContentType[])
  if (raw.includes('all')) {
    return new Set(['posts', 'reports', 'profiles', 'edges'])
  }
  return new Set(raw.filter((t): t is 'posts' | 'reports' | 'profiles' | 'edges' => t !== 'all'))
}

function reportHaystack(report: IntelReportSnapshot): string {
  const themeNames = report.narrative.themes.map((t) => t.name).join(' ')
  return [report.narrative.executiveSummary, report.narrative.strategicAssessment, themeNames]
    .filter(Boolean)
    .join('\n')
}

export function grepIntel(snap: IntelSnapshot, scope: ComposeScope, opts: GrepIntelOpts): GrepHit[] {
  const terms = queryTerms(opts.query)
  if (terms.length === 0) return []

  const wantTypes = expandGrepTypes(opts.types)
  const limit = clampLimit(opts.limit, GREP_LIMIT_DEFAULT, GREP_LIMIT_MAX)
  const handleFilter = opts.handle != null ? normalizeHandle(opts.handle) : null
  const hits: GrepHit[] = []

  for (const sub of subjectsInScope(snap, scope)) {
    if (handleFilter && normalizeHandle(sub.username) !== handleFilter) continue

    if (wantTypes.has('posts')) {
      for (const post of sub.posts) {
        if (!inDateRange(post.createdAt, opts.since, opts.until)) continue
        if (!matchesAllTerms(post.text, terms)) continue
        hits.push({
          handle: sub.username,
          kind: sub.kind,
          type: 'post',
          id: post.id,
          date: post.createdAt.slice(0, 10),
          snippet: snippetAround(post.text, terms),
        })
        if (hits.length >= limit) return hits
      }
    }

    if (wantTypes.has('reports')) {
      for (const report of sub.reports) {
        const hay = reportHaystack(report)
        if (!matchesAllTerms(hay, terms)) continue
        hits.push({
          handle: sub.username,
          kind: sub.kind,
          type: 'report',
          id: report.id,
          date: report.createdAt.slice(0, 10),
          snippet: snippetAround(hay, terms),
        })
        if (hits.length >= limit) return hits
      }
    }

    if (wantTypes.has('profiles') && sub.profile?.bio) {
      if (matchesAllTerms(sub.profile.bio, terms)) {
        hits.push({
          handle: sub.username,
          kind: sub.kind,
          type: 'profile',
          id: sub.profile.id,
          snippet: snippetAround(sub.profile.bio, terms),
        })
        if (hits.length >= limit) return hits
      }
    }

    if (wantTypes.has('edges')) {
      for (const edge of sub.edges) {
        if (!matchesAllTerms(edge.targetUsername, terms)) continue
        hits.push({
          handle: sub.username,
          kind: sub.kind,
          type: 'edge',
          id: `${edge.source}->${edge.targetUsername}`,
          date: edge.lastSeen.slice(0, 10),
          snippet: snippetAround(edge.targetUsername, terms),
        })
        if (hits.length >= limit) return hits
      }
    }
  }

  return hits
}

function subjectRoot(sub: LibrarySubject): string {
  return `intel/${sub.kind}/@${sub.username}`
}

function enumerateIntelPaths(sub: LibrarySubject): GlobIntelEntry[] {
  const root = subjectRoot(sub)
  const entries: GlobIntelEntry[] = []

  if (sub.profile) {
    entries.push({ path: `${root}/profile`, meta: { username: sub.username } })
  }

  entries.push({ path: `${root}/posts`, meta: { count: sub.posts.length } })
  const dates = new Set(sub.posts.map((p) => p.createdAt.slice(0, 10)))
  for (const d of [...dates].sort()) {
    entries.push({ path: `${root}/posts/${d}` })
  }

  entries.push({ path: `${root}/reports`, meta: { count: sub.reports.length } })
  for (const r of sub.reports) {
    entries.push({ path: `${root}/reports/${r.id}`, meta: { reportId: r.id } })
  }

  entries.push({ path: `${root}/edges`, meta: { count: sub.edges.length } })

  if (sub.kind === 'self') {
    entries.push({ path: `${root}/bookmarks`, meta: { count: sub.bookmarks.length } })
    entries.push({ path: `${root}/likes`, meta: { count: sub.likes.length } })
  }

  return entries
}

/** Convert a simple glob with `*` and `**` into a RegExp. */
function globToRegExp(pattern: string): RegExp {
  let i = 0
  let out = '^'
  while (i < pattern.length) {
    const c = pattern[i]!
    if (c === '*' && pattern[i + 1] === '*') {
      // `/**/` or trailing `/**` or leading `**/`
      if (pattern[i + 2] === '/') {
        out += '(?:.*/)?'
        i += 3
      } else {
        out += '.*'
        i += 2
      }
      continue
    }
    if (c === '*') {
      out += '[^/]*'
      i += 1
      continue
    }
    if (c === '?') {
      out += '[^/]'
      i += 1
      continue
    }
    if ('\\.[]{}()+-^$|'.includes(c)) {
      out += '\\' + c
    } else {
      out += c
    }
    i += 1
  }
  out += '$'
  return new RegExp(out)
}

export function globIntel(
  snap: IntelSnapshot,
  scope: ComposeScope,
  pattern: string,
): GlobIntelEntry[] {
  const re = globToRegExp(pattern)
  const out: GlobIntelEntry[] = []
  for (const sub of subjectsInScope(snap, scope)) {
    for (const entry of enumerateIntelPaths(sub)) {
      if (re.test(entry.path)) out.push(entry)
    }
  }
  return out
}

export function getPosts(snap: IntelSnapshot, scope: ComposeScope, opts: GetPostsOpts): Post[] {
  const sub = getSubject(snap, scope, opts.handle)
  if (!sub) return []

  const source = opts.source ?? 'posts'
  let posts: Post[] =
    source === 'bookmarks' ? sub.bookmarks : source === 'likes' ? sub.likes : sub.posts

  if (opts.since || opts.until) {
    posts = posts.filter((p) => inDateRange(p.createdAt, opts.since, opts.until))
  }
  if (opts.kinds?.length) {
    const kinds = new Set(opts.kinds)
    posts = posts.filter((p) => kinds.has(p.kind))
  }
  if (opts.ids?.length) {
    const ids = new Set(opts.ids)
    posts = posts.filter((p) => ids.has(p.id))
  }

  posts = [...posts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  const limit = clampLimit(opts.limit, POSTS_LIMIT_DEFAULT, POSTS_LIMIT_MAX)
  return posts.slice(0, limit)
}

export function getReport(
  snap: IntelSnapshot,
  scope: ComposeScope,
  opts: { handle: string; reportId?: string },
): IntelReportSnapshot | null {
  const sub = getSubject(snap, scope, opts.handle)
  if (!sub || sub.reports.length === 0) return null

  if (opts.reportId) {
    return sub.reports.find((r) => r.id === opts.reportId) ?? null
  }

  // reports[0] is treated as newest-first (fixture / store convention)
  return sub.reports[0] ?? null
}

export function getEdges(
  snap: IntelSnapshot,
  scope: ComposeScope,
  opts: { handle: string; limit?: number },
): Edge[] {
  const sub = getSubject(snap, scope, opts.handle)
  if (!sub) return []
  const limit = clampLimit(opts.limit, EDGES_LIMIT_DEFAULT, 100)
  return [...sub.edges]
    .sort((a, b) => b.weight - a.weight || a.targetUsername.localeCompare(b.targetUsername))
    .slice(0, limit)
}

export function getProfile(
  snap: IntelSnapshot,
  scope: ComposeScope,
  handle: string,
): Profile | null {
  return getSubject(snap, scope, handle)?.profile ?? null
}
