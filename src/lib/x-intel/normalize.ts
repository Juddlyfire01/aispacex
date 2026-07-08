// src/lib/x-intel/normalize.ts
import type { XUserRaw, XPostRaw, XPostEntities, Profile, Post, Edge } from './types'
import { condenseUrlLabel } from './linkify'

function mapBioUrls(raw: XUserRaw): Profile['bioUrls'] {
  return (raw.entities?.description?.urls ?? []).map((u) => ({
    url: u.url,
    expanded: u.expanded_url,
    display: u.display_url,
    start: u.start,
    end: u.end,
  }))
}

function mapWebsite(raw: XUserRaw): Profile['website'] {
  const ent = raw.entities?.url?.urls?.[0]
  if (ent) return { href: ent.url, display: ent.display_url }
  if (raw.url) return { href: raw.url, display: condenseUrlLabel(raw.url) }
  return null
}

function affiliationUserIds(raw: XUserRaw): string[] {
  const ids = raw.affiliation?.user_id
  if (!ids) return []
  return (Array.isArray(ids) ? ids : [ids]).map(String)
}

function mapAutomatedBy(raw: XUserRaw, includedUsers?: XUserRaw[]): Profile['automatedBy'] {
  const aff = raw.affiliation
  if (!aff || aff.badge_url) return null

  const ids = affiliationUserIds(raw)
  const parent = ids.length ? includedUsers?.find((u) => u.id === ids[0]) : undefined
  if (!parent?.username) return null

  const description = aff.description?.trim() ?? ''
  if (description && !/automated/i.test(description)) return null

  return { username: parent.username }
}

export function normalizeProfile(raw: XUserRaw, includes?: { users?: XUserRaw[] }): Profile {
  const m = raw.public_metrics
  return {
    id: raw.id,
    username: raw.username,
    displayName: raw.name,
    avatarUrl: raw.profile_image_url ?? '',
    bannerUrl: raw.profile_banner_url ?? null,
    bio: raw.description || null,
    bioUrls: mapBioUrls(raw),
    website: mapWebsite(raw),
    location: raw.location || null,
    url: raw.url || null,
    verified: {
      legacy: raw.verified ?? false,
      type: raw.verified_type && raw.verified_type !== 'none' ? raw.verified_type : null,
    },
    automatedBy: mapAutomatedBy(raw, includes?.users),
    metrics: {
      followers: m?.followers_count ?? 0,
      following: m?.following_count ?? 0,
      posts: m?.tweet_count ?? 0,
      likes: m?.like_count ?? 0,
      listed: m?.listed_count ?? 0,
      media: m?.media_count ?? 0,
    },
    accountCreated: raw.created_at ?? '',
    pinnedPostId: raw.pinned_tweet_id ?? null,
    mostRecentPostId: raw.most_recent_tweet_id ?? null,
    gatheredAt: new Date().toISOString(),
  }
}

/** Backfill link metadata fields on profiles persisted before bioUrls existed. */
export function ensureProfileShape(profile: Profile): Profile {
  return {
    ...profile,
    bioUrls: profile.bioUrls ?? [],
    website: profile.website ?? null,
    bannerUrl: profile.bannerUrl ?? null,
    automatedBy: profile.automatedBy ?? null,
  }
}

/** True when a stored profile is missing link entity data that only a fresh fetch provides. */
export function profileNeedsLinkRefresh(profile: Profile): boolean {
  if (!Array.isArray(profile.bioUrls)) return true
  if (!profile.bio?.includes('t.co')) return false
  if (profile.bioUrls.length === 0) return true
  return profile.bioUrls.every((u) => u.start == null)
}

const KIND_MAP: Record<string, Post['kind']> = {
  replied_to: 'reply',
  quoted: 'quote',
  retweeted: 'retweet',
}

function mapMentions(mentions: XPostEntities['mentions'] | undefined): Post['mentions'] {
  return mentions?.map((mn) => ({
    username: mn.username,
    id: mn.id ?? '',
    start: mn.start,
    end: mn.end,
  })) ?? []
}

/** Prefer note_tweet — root `text` is truncated for long-form posts. */
function resolvePostBody(raw: XPostRaw): { text: string; entities: XPostRaw['entities'] | undefined } {
  const note = raw.note_tweet
  if (note?.text) {
    return { text: note.text, entities: note.entities ?? raw.entities }
  }
  return { text: raw.text, entities: raw.entities }
}

export function normalizePost(raw: XPostRaw): Post {
  const m = raw.public_metrics
  const ref = raw.referenced_tweets?.[0]
  const { text, entities } = resolvePostBody(raw)
  return {
    id: raw.id,
    authorId: raw.author_id ?? '',
    text,
    lang: raw.lang ?? 'und',
    createdAt: raw.created_at ?? '',
    metrics: {
      impressions: m?.impression_count ?? 0,
      likes: m?.like_count ?? 0,
      reposts: m?.retweet_count ?? 0,
      replies: m?.reply_count ?? 0,
      quotes: m?.quote_count ?? 0,
      bookmarks: m?.bookmark_count ?? 0,
    },
    kind: ref ? (KIND_MAP[ref.type] ?? 'original') : 'original',
    referenced: raw.referenced_tweets?.map((r) => ({ id: r.id, type: r.type })) ?? [],
    urls: entities?.urls?.map((u) => ({ expanded: u.expanded_url, display: u.display_url, title: u.title })) ?? [],
    mentions: mapMentions(entities?.mentions),
    mediaKeys: raw.attachments?.media_keys ?? [],
    contextAnnotations: raw.context_annotations?.map((c) => ({ domain: c.domain.name, entity: c.entity.name })) ?? [],
    gatheredAt: new Date().toISOString(),
  }
}

export function deriveEdges(sourceUserId: string, posts: Post[]): Edge[] {
  const map = new Map<string, Edge>()

  const bump = (key: string, edge: Omit<Edge, 'weight'>) => {
    const existing = map.get(key)
    if (existing) {
      existing.weight += 1
      if (edge.lastSeen > existing.lastSeen) existing.lastSeen = edge.lastSeen
      // Upgrade placeholder target (user:... / post:...) to a real id when one arrives
      const isPlaceholder = (t: string) => t.startsWith('user:') || t.startsWith('post:')
      if (isPlaceholder(existing.target) && !isPlaceholder(edge.target)) {
        existing.target = edge.target
      }
    } else {
      map.set(key, { ...edge, weight: 1 })
    }
  }

  for (const post of posts) {
    for (const mn of post.mentions) {
      bump(`mention:${mn.username}`, {
        source: sourceUserId,
        target: mn.id || `user:${mn.username}`,
        targetUsername: mn.username,
        kind: 'mention',
        lastSeen: post.createdAt,
      })
    }
    for (const ref of post.referenced) {
      const kind = KIND_MAP[ref.type]
      if (!kind || kind === 'original') continue
      bump(`${kind}:${ref.id}`, {
        source: sourceUserId,
        target: `post:${ref.id}`, // placeholder — resolved to a user id on demand
        targetUsername: '',
        kind,
        lastSeen: post.createdAt,
      })
    }
  }

  return [...map.values()]
}
