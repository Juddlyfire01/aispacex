import { ALPHA_COLD_TTL_MS } from './default-rails'
import type { AlphaColdBrief, AlphaColdPost, AlphaColdStory } from './types'

export interface AlphaArchiveState {
  briefs: Record<string, AlphaColdBrief>
  stories: Record<string, AlphaColdStory>
  posts: Record<string, AlphaColdPost>
}

export function pruneAlphaArchive(
  state: AlphaArchiveState,
  now = Date.now(),
): AlphaArchiveState {
  const cutoff = now - ALPHA_COLD_TTL_MS
  const keep = <T extends { fetchedAt: number; pinned: boolean }>(
    m: Record<string, T>,
  ): Record<string, T> =>
    Object.fromEntries(
      Object.entries(m).filter(([, v]) => v.pinned || v.fetchedAt >= cutoff),
    )
  return {
    briefs: keep(state.briefs),
    stories: keep(state.stories),
    posts: keep(state.posts),
  }
}

export function upsertBrief(
  state: AlphaArchiveState,
  brief: AlphaColdBrief,
): AlphaArchiveState {
  return {
    ...state,
    briefs: { ...state.briefs, [brief.id]: brief },
  }
}

export function upsertStory(
  state: AlphaArchiveState,
  story: AlphaColdStory,
): AlphaArchiveState {
  return {
    ...state,
    stories: { ...state.stories, [story.id]: story },
  }
}

export function upsertPosts(
  state: AlphaArchiveState,
  posts: AlphaColdPost[],
): AlphaArchiveState {
  const next = { ...state.posts }
  for (const p of posts) {
    const prev = next[p.id]
    if (!prev || p.fetchedAt >= prev.fetchedAt) {
      next[p.id] = { ...p, pinned: prev?.pinned ?? p.pinned }
    }
  }
  return { ...state, posts: next }
}

export function setPinned(
  state: AlphaArchiveState,
  kind: 'brief' | 'story' | 'post',
  id: string,
  pinned: boolean,
): AlphaArchiveState {
  if (kind === 'brief' && state.briefs[id]) {
    return {
      ...state,
      briefs: { ...state.briefs, [id]: { ...state.briefs[id]!, pinned } },
    }
  }
  if (kind === 'story' && state.stories[id]) {
    return {
      ...state,
      stories: { ...state.stories, [id]: { ...state.stories[id]!, pinned } },
    }
  }
  if (kind === 'post' && state.posts[id]) {
    return {
      ...state,
      posts: { ...state.posts, [id]: { ...state.posts[id]!, pinned } },
    }
  }
  return state
}

export type ArchiveHit = {
  kind: 'brief' | 'story' | 'post'
  id: string
  snippet: string
}

export function listArchive(
  state: AlphaArchiveState,
  opts?: {
    kind?: 'brief' | 'story' | 'post' | 'all'
    railId?: string
    pinnedOnly?: boolean
    limit?: number
  },
): ArchiveHit[] {
  const limit = opts?.limit ?? 20
  const kind = opts?.kind ?? 'all'
  type Row = ArchiveHit & { fetchedAt: number }
  const rows: Row[] = []

  if (kind === 'all' || kind === 'brief') {
    for (const b of Object.values(state.briefs)) {
      if (opts?.pinnedOnly && !b.pinned) continue
      if (opts?.railId && b.railId !== opts.railId) continue
      rows.push({
        kind: 'brief',
        id: b.id,
        snippet: b.markdown.slice(0, 160),
        fetchedAt: b.fetchedAt,
      })
    }
  }
  if (kind === 'all' || kind === 'story') {
    for (const s of Object.values(state.stories)) {
      if (opts?.pinnedOnly && !s.pinned) continue
      rows.push({
        kind: 'story',
        id: s.id,
        snippet: s.name,
        fetchedAt: s.fetchedAt,
      })
    }
  }
  if (kind === 'all' || kind === 'post') {
    for (const p of Object.values(state.posts)) {
      if (opts?.pinnedOnly && !p.pinned) continue
      if (opts?.railId && p.railId !== opts.railId) continue
      rows.push({
        kind: 'post',
        id: p.id,
        snippet: p.text.slice(0, 160),
        fetchedAt: p.fetchedAt,
      })
    }
  }

  return rows
    .sort((a, b) => b.fetchedAt - a.fetchedAt)
    .slice(0, limit)
    .map(({ kind: k, id, snippet }) => ({ kind: k, id, snippet }))
}

export function grepArchive(
  state: AlphaArchiveState,
  query: string,
  limit = 20,
): ArchiveHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: ArchiveHit[] = []
  for (const b of Object.values(state.briefs)) {
    if (b.markdown.toLowerCase().includes(q)) {
      hits.push({ kind: 'brief', id: b.id, snippet: b.markdown.slice(0, 160) })
    }
  }
  for (const s of Object.values(state.stories)) {
    const blob = `${s.name} ${s.hook ?? ''} ${s.summary ?? ''}`.toLowerCase()
    if (blob.includes(q)) {
      hits.push({ kind: 'story', id: s.id, snippet: s.name })
    }
  }
  for (const p of Object.values(state.posts)) {
    if (p.text.toLowerCase().includes(q)) {
      hits.push({ kind: 'post', id: p.id, snippet: p.text.slice(0, 160) })
    }
  }
  return hits.slice(0, limit)
}

export function getBrief(state: AlphaArchiveState, id: string): AlphaColdBrief | null {
  return state.briefs[id] ?? null
}

export function getStoryWithPosts(
  state: AlphaArchiveState,
  id: string,
): { story: AlphaColdStory; posts: AlphaColdPost[] } | null {
  const story = state.stories[id]
  if (!story) return null
  const posts = story.clusterPostIds
    .map((pid) => state.posts[pid])
    .filter((p): p is AlphaColdPost => Boolean(p))
  return { story, posts }
}
