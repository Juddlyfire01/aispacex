import type { Edge, IntelReportSnapshot, Post, Profile } from '../x-intel/types'

export type LibraryKind = 'self' | 'target'

export type ComposeScope =
  | { type: 'me' }
  | { type: 'target'; username: string }
  | { type: 'all' }

export interface LibrarySubject {
  kind: LibraryKind
  id: string
  username: string
  profile: Profile | null
  posts: Post[]
  bookmarks: Post[]
  likes: Post[]
  edges: Edge[]
  reports: IntelReportSnapshot[]
  refreshedAt?: string
}

export interface IntelSnapshot {
  subjects: LibrarySubject[]
}

export interface GrepHit {
  handle: string
  kind: LibraryKind
  type: 'post' | 'report' | 'profile' | 'edge'
  id: string
  date?: string
  snippet: string
}

export interface LibraryCounts {
  subjects: number
  posts: number
  reports: number
  bookmarks: number
  likes: number
}
