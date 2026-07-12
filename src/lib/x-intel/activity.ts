// At-a-glance "situational awareness" activity summary, derived purely from data
// already in the store (no extra X API cost). Everything here is grounded in a
// real timestamp: own posts carry an authored `createdAt` (and a snowflake id),
// inbound mentions carry the mentioner's authored time, and the profile's
// `mostRecentPostId` snowflake gives the freshest "last posted" time without
// fetching the post body. NOTE: likes/bookmarks are deliberately NOT summarized —
// X exposes no like/bookmark action time, only the underlying tweet's authored
// time, which is too ambiguous to be a useful activity signal.
import type { Profile, Post } from './types'

const X_EPOCH = 1288834974657n // 2010-11-04T01:42:54.657Z — Twitter/X snowflake epoch
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const WEEK_MS = 7 * DAY_MS

/** Decode the authored time (ms) encoded in a tweet snowflake id. */
export function tweetIdToMs(id: string | null | undefined): number | null {
  if (!id) return null
  try {
    return Number((BigInt(id) >> 22n) + X_EPOCH)
  } catch {
    return null
  }
}

/** Split a gathered post set into the subject's own posts vs inbound mentions. */
export function partitionPosts(profile: Profile, posts: Post[]): { own: Post[]; inbound: Post[] } {
  const own = posts.filter((p) => p.authorId === profile.id)
  const inbound = posts.filter((p) => p.authorId && p.authorId !== profile.id)
  return { own, inbound }
}

/**
 * Highest snowflake id among posts we already hold that the subject authored.
 * Used as X API `since_id` for incremental timeline pulls.
 *
 * Must NOT use profile.mostRecentPostId: that field is the live "latest tweet"
 * on X. After a profile refresh it already points at the newest post, so
 * since_id would exclude it and every newer post until a full re-gather.
 * Inbound mention ids must also be excluded — a recent @mention can have a
 * higher snowflake than the subject's last own post and would skip their posts.
 */
export function maxOwnPostId(authorId: string | null | undefined, posts: Post[]): string | undefined {
  if (!authorId || posts.length === 0) return undefined
  let max: bigint | null = null
  let maxId: string | undefined
  for (const p of posts) {
    if (p.authorId !== authorId) continue
    try {
      const id = BigInt(p.id)
      if (max == null || id > max) {
        max = id
        maxId = p.id
      }
    } catch {
      // non-snowflake ids (tests / legacy) — fall back to string compare below
    }
  }
  if (maxId) return maxId
  // Fallback when ids aren't numeric snowflakes: newest createdAt among own posts.
  let best: Post | undefined
  for (const p of posts) {
    if (p.authorId !== authorId) continue
    if (!best || p.createdAt > best.createdAt) best = p
  }
  return best?.id
}

/** True when a gathered row is someone else's tweet that mentions the subject. */
export function isInboundPost(profile: Profile, post: Post): boolean {
  return Boolean(post.authorId && post.authorId !== profile.id)
}

/**
 * Thread-routing @handles X prefixes at the start of reply / quote text. For
 * reply chains this can be several contiguous mentions; bare quote tweets are
 * often just "@author https://t.co/…" with no added commentary.
 */
export function threadPrefixMentions(post: Post): Post['mentions'] {
  if ((post.kind !== 'reply' && post.kind !== 'quote') || !post.mentions.length) return []

  const withSpan = post.mentions.filter(
    (m): m is Post['mentions'][number] & { start: number; end: number } =>
      m.start != null && m.end != null,
  )

  if (withSpan.length === post.mentions.length) {
    const sorted = [...withSpan].sort((a, b) => a.start - b.start)
    const prefix: Post['mentions'] = []
    let cursor = 0
    for (const m of sorted) {
      if (prefix.length === 0) {
        if (m.start !== 0) break
      } else if (!/^\s*$/.test(post.text.slice(cursor, m.start))) {
        break
      }
      prefix.push(m)
      cursor = m.end
    }
    return prefix
  }

  return mentionsMatchingLeadingUsernames(post.mentions, leadingMentionUsernames(post.text))
}

/** @handles parsed from the leading run of @user tokens in reply text (legacy fallback). */
export function leadingMentionUsernames(text: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && text[i] === ' ') i++
    if (text[i] !== '@') break
    const match = text.slice(i + 1).match(/^([A-Za-z0-9_]{1,15})(?=$|\s|[^\w])/)
    if (!match) break
    out.push(match[1].toLowerCase())
    i += 1 + match[0].length
  }
  return out
}

function mentionKey(m: Post['mentions'][number]): string {
  return m.id || m.username.toLowerCase()
}

function mentionsMatchingLeadingUsernames(
  mentions: Post['mentions'],
  leading: string[],
): Post['mentions'] {
  const counts = new Map<string, number>()
  for (const u of leading) counts.set(u, (counts.get(u) ?? 0) + 1)
  const prefix: Post['mentions'] = []
  for (const m of mentions) {
    const k = m.username.toLowerCase()
    const n = counts.get(k) ?? 0
    if (n > 0) {
      counts.set(k, n - 1)
      prefix.push(m)
    } else {
      break
    }
  }
  return prefix
}

/**
 * @mentions the author deliberately added. Excludes:
 * - retweets (RT @author: attribution + echoed tweet mentions)
 * - reply / quote thread prefixes (contiguous leading @handles)
 *
 * Also treats posts whose `referenced` list contains a retweeted/reposted entry
 * as retweets even when `post.kind` was mis-normalized to `original` (X began
 * returning `reposted` while our map only knew `retweeted`).
 */
export function explicitOutboundMentions(post: Post): Post['mentions'] {
  if (!post.mentions.length) return []
  const isRepost = post.kind === 'retweet'
    || post.referenced.some((r) => r.type === 'retweeted' || r.type === 'reposted')
  if (isRepost) return []
  if (post.kind === 'reply' || post.kind === 'quote') {
    const prefixKeys = new Set(threadPrefixMentions(post).map(mentionKey))
    return post.mentions.filter((m) => !prefixKeys.has(mentionKey(m)))
  }
  return post.mentions
}

export function hasExplicitMentionOut(post: Post): boolean {
  return explicitOutboundMentions(post).some((m) => m.username)
}

/**
 * Feed filter keys — authored kinds plus inbound direction.
 * - `reply` = this account wrote a reply
 * - `reply-in` = someone else replied to this account (Performance "Replies" total)
 * - `mention-in` / `mention-out` = @mention direction
 */
export type FeedFilterKey = Post['kind'] | 'mention-in' | 'mention-out' | 'reply-in'

/**
 * True when an inbound post is a reply directed at the subject.
 * Prefer `in_reply_to_user_id`; fall back to kind/referenced for older gathers.
 */
export function isInboundReplyToSubject(profile: Profile, post: Post): boolean {
  if (!isInboundPost(profile, post)) return false
  if (post.inReplyToUserId) return post.inReplyToUserId === profile.id
  if (post.kind === 'reply') return true
  return post.referenced.some((r) => r.type === 'replied_to')
}

/** All filter tags that apply to a post (a post can match several). */
export function postFeedFilterKeys(profile: Profile | null, post: Post): FeedFilterKey[] {
  if (profile && isInboundPost(profile, post)) {
    if (isInboundReplyToSubject(profile, post)) return ['reply-in']
    return ['mention-in']
  }
  const keys: FeedFilterKey[] = [post.kind]
  if (hasExplicitMentionOut(post)) keys.push('mention-out')
  return keys
}

/** Union match: show the post if any of its tags are selected. */
export function matchesFeedFilters(
  profile: Profile | null,
  post: Post,
  selected: Set<FeedFilterKey>,
): boolean {
  if (selected.size === 0) return false
  return postFeedFilterKeys(profile, post).some((k) => selected.has(k))
}

export interface ActivitySummary {
  /** Best "last active" proxy: mostRecentPostId snowflake, else newest own post. */
  lastActiveMs: number | null
  lastActiveSource: 'latest-post-id' | 'gathered-post' | null
  postsLast7d: number
  postsLast30d: number
  activeDaysLast7: number
  perDayRecent: number      // last-7d rate
  perDayBaseline: number    // gathered-span average
  tempo: 'up' | 'down' | 'steady'
  pattern: 'burst' | 'steady'
  peakHourUtc: number | null
  busiestWeekday: number | null // 0 = Sunday
  longestGapHours: number
  /** Post-kind mix across gathered own posts (percent, sums ~100). */
  composition: { original: number; reply: number; reposts: number }
  style: 'broadcasting' | 'conversational' | 'amplifying' | 'mixed'
  hasInbound: boolean       // did we gather inbound mentions for this subject?
  mentionsLast7d: number
  lastMentionMs: number | null
}

function postMs(p: Post): number | null {
  const t = Date.parse(p.createdAt)
  return Number.isFinite(t) ? t : tweetIdToMs(p.id)
}

/**
 * Compute an activity summary for a subject. `posts` may contain both the
 * subject's own posts and inbound mentions (targets) — they are split by
 * authorId so own-activity metrics are never polluted by others' tweets.
 */
export function computeActivity(profile: Profile, posts: Post[]): ActivitySummary {
  const now = Date.now()
  const { own, inbound } = partitionPosts(profile, posts)

  const ownTimes = own.map(postMs).filter((t): t is number => t != null).sort((a, b) => a - b)

  // Last active: prefer the profile's most-recent-post snowflake (freshest, free),
  // fall back to the newest own post we actually gathered.
  const idMs = tweetIdToMs(profile.mostRecentPostId)
  const newestOwn = ownTimes.length ? ownTimes[ownTimes.length - 1] : null
  let lastActiveMs: number | null = null
  let lastActiveSource: ActivitySummary['lastActiveSource'] = null
  if (idMs != null && (newestOwn == null || idMs >= newestOwn)) {
    lastActiveMs = idMs
    lastActiveSource = 'latest-post-id'
  } else if (newestOwn != null) {
    lastActiveMs = newestOwn
    lastActiveSource = 'gathered-post'
  } else if (idMs != null) {
    lastActiveMs = idMs
    lastActiveSource = 'latest-post-id'
  }

  // Volume windows
  const postsLast7d = ownTimes.filter((t) => now - t <= WEEK_MS).length
  const postsLast30d = ownTimes.filter((t) => now - t <= 30 * DAY_MS).length
  const activeDaysLast7 = new Set(
    ownTimes.filter((t) => now - t <= WEEK_MS).map((t) => new Date(t).toISOString().slice(0, 10)),
  ).size

  // Rates + tempo (recent 7d vs the gathered-span average)
  const spanDays = ownTimes.length >= 2 ? (ownTimes[ownTimes.length - 1] - ownTimes[0]) / DAY_MS : 0
  const perDayRecent = postsLast7d / 7
  const perDayBaseline = spanDays > 0 ? own.length / spanDays : perDayRecent
  let tempo: ActivitySummary['tempo'] = 'steady'
  if (perDayBaseline > 0) {
    if (perDayRecent >= perDayBaseline * 1.25) tempo = 'up'
    else if (perDayRecent <= perDayBaseline * 0.75) tempo = 'down'
  }

  // Rhythm: hour/weekday histograms + burstiness from daily-count variation
  const hourHist = new Array(24).fill(0)
  const weekdayHist = new Array(7).fill(0)
  const dailyCounts = new Map<string, number>()
  for (const t of ownTimes) {
    const d = new Date(t)
    hourHist[d.getUTCHours()] += 1
    weekdayHist[d.getUTCDay()] += 1
    const key = d.toISOString().slice(0, 10)
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1)
  }
  const argmax = (arr: number[]): number | null => {
    let best = -1, idx: number | null = null
    arr.forEach((v, i) => { if (v > best) { best = v; idx = i } })
    return best > 0 ? idx : null
  }
  const peakHourUtc = argmax(hourHist)
  const busiestWeekday = argmax(weekdayHist)

  const counts = [...dailyCounts.values()]
  const meanDaily = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0
  const variance = counts.length
    ? counts.reduce((a, c) => a + (c - meanDaily) ** 2, 0) / counts.length
    : 0
  const cv = meanDaily > 0 ? Math.sqrt(variance) / meanDaily : 0
  const pattern: ActivitySummary['pattern'] = cv > 1 ? 'burst' : 'steady'

  let longestGapMs = 0
  for (let i = 1; i < ownTimes.length; i++) {
    longestGapMs = Math.max(longestGapMs, ownTimes[i] - ownTimes[i - 1])
  }

  // Style from post-kind composition of gathered own posts. Originals / replies /
  // reposts (retweets + quotes) are the three exhaustive buckets we surface.
  const kindCount = { original: 0, reply: 0, quote: 0, retweet: 0 }
  for (const p of own) kindCount[p.kind] += 1
  const pctOf = (n: number) => (own.length ? Math.round((n / own.length) * 100) : 0)
  const originalPct = pctOf(kindCount.original)
  const replyPct = pctOf(kindCount.reply)
  const repostsPct = own.length ? Math.max(0, 100 - originalPct - replyPct) : 0
  let style: ActivitySummary['style'] = 'mixed'
  if (originalPct >= 60) style = 'broadcasting'
  else if (replyPct >= 40) style = 'conversational'
  else if (repostsPct >= 40) style = 'amplifying'

  // Inbound mentions (present for targets once gathered; absent for self today)
  const inboundTimes = inbound.map(postMs).filter((t): t is number => t != null)
  const mentionsLast7d = inboundTimes.filter((t) => now - t <= WEEK_MS).length
  const lastMentionMs = inboundTimes.length ? Math.max(...inboundTimes) : null

  return {
    lastActiveMs,
    lastActiveSource,
    postsLast7d,
    postsLast30d,
    activeDaysLast7,
    perDayRecent: Math.round(perDayRecent * 10) / 10,
    perDayBaseline: Math.round(perDayBaseline * 10) / 10,
    tempo,
    pattern,
    peakHourUtc,
    busiestWeekday,
    longestGapHours: Math.round((longestGapMs / HOUR_MS) * 10) / 10,
    composition: { original: originalPct, reply: replyPct, reposts: repostsPct },
    style,
    hasInbound: inbound.length > 0,
    mentionsLast7d,
    lastMentionMs,
  }
}
