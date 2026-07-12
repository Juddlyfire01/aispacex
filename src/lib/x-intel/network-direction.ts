import type { Edge, Post, Profile } from './types'
import {
  buildNetworkGraph,
  type BuildOptions,
  type EdgeKind,
  type NetworkGraphModel,
  type SiblingSubject,
} from './network-build'
import { explicitOutboundMentions, threadPrefixMentions, partitionPosts } from './activity'

/**
 * Engagement direction for the network view.
 *
 * Built directly from partitioned posts — NOT from the blended `Edge[]` ledger.
 * That ledger always stamps `source = subject` and the graph builder treats
 * `target` as "the other person", so inbound edges shaped as author→subject
 * were wiped by the self-loop filter. Posts-first avoids that trap.
 */
export type NetworkDirection = 'outbound' | 'inbound'

const KIND_FROM_REF: Record<string, EdgeKind | undefined> = {
  replied_to: 'reply',
  quoted: 'quote',
  retweeted: 'retweet',
  reposted: 'retweet',
}

export interface AuthorInfo {
  username: string
  avatarUrl?: string | null
}

export interface DirectionalBuildOptions {
  direction: NetworkDirection
  kinds: Set<EdgeKind>
  topN: number
  /** id → handle/avatar for inbound authors and outbound referenced authors. */
  authorDirectory?: Map<string, AuthorInfo>
  siblings?: SiblingSubject[]
}

/**
 * Resolve who a reply/quote/RT engages.
 * Prefer referenced-tweet author from gather includes; fall back to RT
 * attribution / reply-prefix @handle for already-stored posts.
 */
function referencedEngagement(post: Post): { id: string; username: string; kind: EdgeKind } | null {
  for (const ref of post.referenced) {
    const kind = KIND_FROM_REF[ref.type]
    if (!kind) continue
    let id = ref.authorId || ''
    let username = ref.authorUsername || ''
    if (!username) {
      if (kind === 'retweet' && post.mentions[0]) {
        username = post.mentions[0].username
        id = post.mentions[0].id || id
      } else if (kind === 'reply' || kind === 'quote') {
        const prefix = threadPrefixMentions(post)[0]
        if (prefix) {
          username = prefix.username
          id = prefix.id || id
        }
      }
    }
    if (!username && !id) {
      // Unresolved referenced post — caller counts these separately.
      return { id: `post:${ref.id}`, username: '', kind }
    }
    return { id: id || `user:${username}`, username, kind }
  }
  return null
}

/** One engagement event toward an account (outbound) or from an author (inbound). */
interface Hit {
  id: string
  username: string
  kind: EdgeKind
  lastSeen: string
  weight: number
  /** Subject or inbound post that produced this hit. */
  postId: string
}

/**
 * Outbound hits: who the subject engaged, from posts they authored.
 * Mentions = deliberate only; reply/quote/RT = the referenced author.
 */
function outboundHits(subjectId: string, posts: Post[]): { hits: Hit[]; unresolved: number } {
  const hits: Hit[] = []
  let unresolved = 0
  for (const post of posts) {
    if (post.authorId !== subjectId) continue

    const ref = referencedEngagement(post)
    if (ref) {
      if (!ref.username && ref.id.startsWith('post:')) unresolved++
      else hits.push({ id: ref.id, username: ref.username, kind: ref.kind, lastSeen: post.createdAt, weight: 1, postId: post.id })
    }

    for (const mn of explicitOutboundMentions(post)) {
      // Don't double-count the reply/quote/RT target as a mention too.
      if (ref && (
        (mn.id && mn.id === ref.id)
        || (mn.username && ref.username && mn.username.toLowerCase() === ref.username.toLowerCase())
      )) continue
      hits.push({
        id: mn.id || `user:${mn.username}`,
        username: mn.username,
        kind: 'mention',
        lastSeen: post.createdAt,
        weight: 1,
        postId: post.id,
      })
    }
  }
  return { hits, unresolved }
}

/**
 * Inbound hits: who engaged the subject. The account IS the post author.
 * Kind = how they referenced the subject (RT/reply/quote) or plain mention.
 */
function inboundHits(
  profile: Profile,
  posts: Post[],
  authorDirectory?: Map<string, AuthorInfo>,
): { hits: Hit[]; unresolved: number } {
  const hits: Hit[] = []
  let unresolved = 0
  const subjectHandle = profile.username.toLowerCase()

  for (const post of posts) {
    if (!post.authorId || post.authorId === profile.id) continue

    const fromDir = authorDirectory?.get(post.authorId)
    const username = post.authorUsername || fromDir?.username || ''
    if (!username) {
      // Author id known but handle missing (legacy gather) — can't label a row yet.
      unresolved++
      continue
    }

    let kind: EdgeKind = 'mention'
    for (const ref of post.referenced) {
      const k = KIND_FROM_REF[ref.type]
      if (k) { kind = k; break }
    }

    // Mentions-endpoint posts always reference the subject; guard mixed corpora.
    const mentionsSubject = post.mentions.some((m) => m.username.toLowerCase() === subjectHandle)
    const referencesSubject = post.referenced.some((r) =>
      r.authorId === profile.id
      || (r.authorUsername && r.authorUsername.toLowerCase() === subjectHandle),
    )
    if (kind === 'mention' && !mentionsSubject && !referencesSubject) continue

    hits.push({
      id: post.authorId,
      username,
      kind,
      lastSeen: post.createdAt,
      weight: 1,
      postId: post.id,
    })
  }
  return { hits, unresolved }
}

/** Collapse hits into the Edge[] shape buildNetworkGraph already understands:
 *  source = subject, target = other account. Same polarity for both directions —
 *  "direction" only changes which posts produced the hits. */
function hitsToEdges(subjectId: string, hits: Hit[]): Edge[] {
  const map = new Map<string, Edge>()
  for (const h of hits) {
    if (!h.username && h.id.startsWith('post:')) continue
    const key = `${h.kind}:${h.username ? h.username.toLowerCase() : h.id}`
    const existing = map.get(key)
    if (existing) {
      existing.weight += h.weight
      if (h.lastSeen > existing.lastSeen) existing.lastSeen = h.lastSeen
      if (existing.target.startsWith('user:') && h.id && !h.id.startsWith('user:') && !h.id.startsWith('post:')) {
        existing.target = h.id
      }
    } else {
      map.set(key, {
        source: subjectId,
        target: h.id,
        targetUsername: h.username,
        kind: h.kind,
        weight: h.weight,
        lastSeen: h.lastSeen,
      })
    }
  }
  return [...map.values()]
}

const SOURCE_POST_CAP = 20

/**
 * Attach newest-first contributing post ids onto each visible graph node so the
 * ranked list can expand source links without re-scanning the corpus.
 */
function attachSourcePostIds(
  model: NetworkGraphModel,
  hits: Hit[],
  kinds: Set<EdgeKind>,
): NetworkGraphModel {
  const byKey = new Map<string, { postId: string; lastSeen: string }[]>()
  for (const h of hits) {
    if (!kinds.has(h.kind)) continue
    if (!h.username && h.id.startsWith('post:')) continue
    const key = h.username ? h.username.toLowerCase() : h.id
    let list = byKey.get(key)
    if (!list) {
      list = []
      byKey.set(key, list)
    }
    if (!list.some((x) => x.postId === h.postId)) {
      list.push({ postId: h.postId, lastSeen: h.lastSeen })
    }
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0))
  }
  return {
    ...model,
    nodes: model.nodes.map((n) => {
      const key = n.username ? n.username.toLowerCase() : n.id
      const list = byKey.get(key) ?? byKey.get(n.id) ?? []
      return {
        ...n,
        sourcePostIds: list.slice(0, SOURCE_POST_CAP).map((x) => x.postId),
      }
    }),
  }
}

/**
 * Build the network graph for one direction straight from the post corpus.
 * This is the Network tab's source of truth — do not feed it `report.edges`.
 */
export function buildNetworkFromPosts(
  profile: Profile,
  posts: Post[],
  opts: DirectionalBuildOptions,
): NetworkGraphModel {
  const { own, inbound } = partitionPosts(profile, posts)
  const { hits, unresolved } = opts.direction === 'outbound'
    ? outboundHits(profile.id, own)
    : inboundHits(profile, inbound, opts.authorDirectory)

  const edges = hitsToEdges(profile.id, hits)
  const buildOpts: BuildOptions = {
    kinds: opts.kinds,
    topN: opts.topN,
    posts: opts.direction === 'outbound' ? own : inbound,
    siblings: opts.siblings,
  }
  const model = buildNetworkGraph(profile, edges, buildOpts)
  const withSources = attachSourcePostIds(model, hits, opts.kinds)
  // Surface unresolved referenced posts (outbound) / authors without handles (inbound).
  return { ...withSources, unresolvedCount: withSources.unresolvedCount + unresolved }
}

/** @deprecated Prefer buildNetworkFromPosts. Kept for tests that exercise Edge polarity. */
export function outboundEdges(subjectId: string, posts: Post[]): Edge[] {
  const { hits } = outboundHits(subjectId, posts)
  return hitsToEdges(subjectId, hits)
}

/** @deprecated Prefer buildNetworkFromPosts. */
export function inboundEdges(
  subjectId: string,
  subjectUsername: string,
  posts: Post[],
  authorDirectory?: Map<string, { username: string }>,
): Edge[] {
  const profile = { id: subjectId, username: subjectUsername } as Profile
  const { hits } = inboundHits(profile, posts, authorDirectory)
  return hitsToEdges(subjectId, hits)
}

export function directionalEdges(
  subjectId: string,
  subjectUsername: string,
  posts: Post[],
  authorDirectory?: Map<string, { username: string }>,
): Record<NetworkDirection, Edge[]> {
  return {
    outbound: outboundEdges(subjectId, posts),
    inbound: inboundEdges(subjectId, subjectUsername, posts, authorDirectory),
  }
}
