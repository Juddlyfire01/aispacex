import type { Edge, Post, Profile } from './types'

/**
 * Pure graph-builder for the Network bubble map.
 *
 * Turns the raw per-kind `Edge[]` (one edge per kind × target, produced by
 * deriveEdges) plus already-stored posts into a human-scaled model:
 *  - one aggregated node per account, ranked by total engagement
 *  - top-N cap with a long-tail summary
 *  - cross-links between visible accounts derived from stored posts and
 *    sibling tracked targets (zero API cost)
 */

export type EdgeKind = Edge['kind']

export interface KindBreakdown {
  mention: number
  reply: number
  quote: number
  retweet: number
}

export interface GraphNode {
  /** X user id when known, otherwise the `user:<username>` placeholder key. */
  id: string
  username: string          // without '@'; '' never happens for map nodes
  totalWeight: number
  byKind: KindBreakdown
  /** Dominant engagement kind (highest count; ties break in KIND order). */
  dominantKind: EdgeKind
  lastSeen: string          // ISO — most recent across the merged kind-edges
  avatarUrl: string | null  // known only for tracked targets / self accounts
  rank: number              // 0 = heaviest
  /** Contributing post ids (newest first), for expandable source links in the list. */
  sourcePostIds: string[]
}

export interface GraphSpoke {
  /** Node id (target of the aggregated engagement). */
  nodeId: string
  totalWeight: number
  byKind: KindBreakdown
  dominantKind: EdgeKind
}

export interface CrossLink {
  a: string                 // node id
  b: string                 // node id
  weight: number
  source: 'posts' | 'sibling'
}

export interface NetworkGraphModel {
  center: { id: string; username: string; avatarUrl: string | null }
  nodes: GraphNode[]        // ranked, capped at topN — excludes the center
  spokes: GraphSpoke[]      // center → node, one per node
  crossLinks: CrossLink[]   // node ↔ node
  /** Accounts aggregated but cut by the top-N cap. */
  longTailCount: number
  /** Sum of totalWeight cut by the cap (for the summary line). */
  longTailWeight: number
  /** `post:` placeholder edges that need a lookup to resolve — not mapped. */
  unresolvedCount: number
}

export interface SiblingSubject {
  /** X user id of the sibling subject (tracked target or self account). */
  id: string
  username: string
  avatarUrl: string | null
  edges: Edge[]
}

export interface BuildOptions {
  /** Kinds to include; edges of other kinds are ignored entirely. */
  kinds: Set<EdgeKind>
  /** Max orbiting accounts to keep (>=1). */
  topN: number
  /** Stored posts for the subject (outbound + inbound mentions). */
  posts?: Post[]
  /** Other tracked subjects (targets and/or self accounts) for cross-links. */
  siblings?: SiblingSubject[]
}

const KIND_ORDER: EdgeKind[] = ['mention', 'reply', 'quote', 'retweet']

const emptyBreakdown = (): KindBreakdown => ({ mention: 0, reply: 0, quote: 0, retweet: 0 })

function dominantOf(byKind: KindBreakdown): EdgeKind {
  let best: EdgeKind = 'mention'
  let bestCount = -1
  for (const k of KIND_ORDER) {
    if (byKind[k] > bestCount) { best = k; bestCount = byKind[k] }
  }
  return best
}

const isPostPlaceholder = (id: string) => id.startsWith('post:')
const isUserPlaceholder = (id: string) => id.startsWith('user:')

/**
 * Aggregate raw kind-edges into one accumulator per account. Accounts are
 * keyed by lowercase username when available (so a `user:` placeholder and a
 * resolved id for the same handle merge), otherwise by target id.
 */
interface Acc {
  id: string
  username: string
  byKind: KindBreakdown
  totalWeight: number
  lastSeen: string
}

function aggregate(
  edges: Edge[],
  kinds: Set<EdgeKind>,
  center: { id: string; username: string },
): { accounts: Acc[]; unresolvedCount: number } {
  const byAccount = new Map<string, Acc>()
  const centerUsername = center.username.toLowerCase()
  let unresolvedCount = 0

  for (const e of edges) {
    if (!kinds.has(e.kind)) continue
    // Skip self-loops: the subject mentioning itself (reply-thread mentions).
    if (e.target === center.id || e.targetUsername.toLowerCase() === centerUsername) continue
    if (isPostPlaceholder(e.target) && !e.targetUsername) {
      unresolvedCount++
      continue
    }
    const key = e.targetUsername ? e.targetUsername.toLowerCase() : e.target
    let acc = byAccount.get(key)
    if (!acc) {
      acc = { id: e.target, username: e.targetUsername, byKind: emptyBreakdown(), totalWeight: 0, lastSeen: e.lastSeen }
      byAccount.set(key, acc)
    }
    acc.byKind[e.kind] += e.weight
    acc.totalWeight += e.weight
    if (e.lastSeen > acc.lastSeen) acc.lastSeen = e.lastSeen
    // Prefer a real id over a placeholder when both appear for the same handle
    if ((isUserPlaceholder(acc.id) || isPostPlaceholder(acc.id)) && !isUserPlaceholder(e.target) && !isPostPlaceholder(e.target)) {
      acc.id = e.target
    }
  }

  return { accounts: [...byAccount.values()], unresolvedCount }
}

/**
 * Cross-links from stored posts: a post authored by visible account X that
 * mentions / references visible account Y yields an X↔Y link. The subject's
 * own posts are skipped (those are the spokes).
 */
function crossLinksFromPosts(
  posts: Post[],
  centerId: string,
  visible: GraphNode[],
): Map<string, CrossLink> {
  const byId = new Map(visible.map((n) => [n.id, n]))
  const byUsername = new Map(visible.filter((n) => n.username).map((n) => [n.username.toLowerCase(), n]))
  const links = new Map<string, CrossLink>()

  const bump = (aId: string, bId: string, source: CrossLink['source']) => {
    if (aId === bId) return
    const [a, b] = aId < bId ? [aId, bId] : [bId, aId]
    const key = `${a}|${b}`
    const existing = links.get(key)
    if (existing) existing.weight += 1
    else links.set(key, { a, b, weight: 1, source })
  }

  for (const post of posts) {
    if (post.authorId === centerId) continue
    const author = byId.get(post.authorId)
    if (!author) continue
    for (const mn of post.mentions) {
      const target = (mn.id && byId.get(mn.id)) || byUsername.get(mn.username.toLowerCase())
      if (target && target.id !== author.id) bump(author.id, target.id, 'posts')
    }
  }

  return links
}

/**
 * Cross-links from sibling subjects: when another tracked subject is itself a
 * visible node here, its own edges toward other visible nodes become links.
 */
function crossLinksFromSiblings(
  siblings: SiblingSubject[],
  centerId: string,
  visible: GraphNode[],
  existing: Map<string, CrossLink>,
): void {
  const byId = new Map(visible.map((n) => [n.id, n]))
  const byUsername = new Map(visible.filter((n) => n.username).map((n) => [n.username.toLowerCase(), n]))

  for (const sib of siblings) {
    if (sib.id === centerId) continue
    const sibNode = byId.get(sib.id) ?? byUsername.get(sib.username.toLowerCase())
    if (!sibNode) continue
    for (const e of sib.edges) {
      const target = (!isUserPlaceholder(e.target) && !isPostPlaceholder(e.target) && byId.get(e.target))
        || (e.targetUsername ? byUsername.get(e.targetUsername.toLowerCase()) : undefined)
      if (!target || target.id === sibNode.id || target.id === centerId) continue
      const [a, b] = sibNode.id < target.id ? [sibNode.id, target.id] : [target.id, sibNode.id]
      const key = `${a}|${b}`
      const prior = existing.get(key)
      if (prior) prior.weight += e.weight
      else existing.set(key, { a, b, weight: e.weight, source: 'sibling' })
    }
  }
}

export function buildNetworkGraph(
  profile: Profile,
  edges: Edge[],
  opts: BuildOptions,
): NetworkGraphModel {
  const topN = Math.max(1, opts.topN)
  const { accounts, unresolvedCount } = aggregate(edges, opts.kinds, profile)

  // Rank: heaviest first; ties by most-recent lastSeen, then username for determinism.
  accounts.sort((a, b) =>
    b.totalWeight - a.totalWeight
    || (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0)
    || a.username.localeCompare(b.username),
  )

  const kept = accounts.slice(0, topN)
  const cut = accounts.slice(topN)

  // Avatars: known for siblings (tracked targets / self accounts) only.
  const avatarByUsername = new Map<string, string>()
  const avatarById = new Map<string, string>()
  for (const sib of opts.siblings ?? []) {
    if (!sib.avatarUrl) continue
    avatarById.set(sib.id, sib.avatarUrl)
    if (sib.username) avatarByUsername.set(sib.username.toLowerCase(), sib.avatarUrl)
  }

  const nodes: GraphNode[] = kept.map((acc, i) => ({
    id: acc.id,
    username: acc.username,
    totalWeight: acc.totalWeight,
    byKind: acc.byKind,
    dominantKind: dominantOf(acc.byKind),
    lastSeen: acc.lastSeen,
    avatarUrl: avatarById.get(acc.id) ?? (acc.username ? avatarByUsername.get(acc.username.toLowerCase()) ?? null : null),
    rank: i,
    sourcePostIds: [],
  }))

  const spokes: GraphSpoke[] = nodes.map((n) => ({
    nodeId: n.id,
    totalWeight: n.totalWeight,
    byKind: n.byKind,
    dominantKind: n.dominantKind,
  }))

  const linkMap = crossLinksFromPosts(opts.posts ?? [], profile.id, nodes)
  crossLinksFromSiblings(opts.siblings ?? [], profile.id, nodes, linkMap)

  return {
    center: { id: profile.id, username: profile.username, avatarUrl: profile.avatarUrl || null },
    nodes,
    spokes,
    crossLinks: [...linkMap.values()].sort((a, b) => b.weight - a.weight),
    longTailCount: cut.length,
    longTailWeight: cut.reduce((s, a) => s + a.totalWeight, 0),
    unresolvedCount,
  }
}
