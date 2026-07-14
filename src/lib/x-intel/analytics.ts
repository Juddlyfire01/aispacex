import type {
  Profile,
  Post,
  Edge,
  ReportAnalytics,
  ChangeSummary,
  MetricStats,
  RankedCount,
  PostKind,
  FollowRatioLabel,
  CadencePattern,
  CadenceVariance,
} from './types'
import { partitionPosts } from './activity'

const POST_KINDS: PostKind[] = ['original', 'reply', 'quote', 'retweet']
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length))
  return sortedAsc[idx]
}

function statsFor(values: number[]): MetricStats {
  if (values.length === 0) return { avg: 0, median: 0, max: 0, total: 0 }
  const total = values.reduce((a, b) => a + b, 0)
  const sorted = [...values].sort((a, b) => a - b)
  return {
    avg: round(total / values.length),
    median: round(median(sorted)),
    max: Math.max(...values),
    total,
  }
}

function rank(counts: Map<string, number>, limit = 10): RankedCount[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
}

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function followLabel(ratio: number, following: number): FollowRatioLabel {
  if (following <= 50 || ratio >= 100) return 'broadcast'
  if (ratio >= 2) return 'networker'
  return 'conversational'
}

/**
 * Deterministically compute every fact/figure the report needs from data already
 * in the store. Pure: same inputs always yield the same output. The LLM later
 * receives this object as ground truth and is told not to recompute it.
 *
 * Posting, engagement, cadence, and topic metrics use only the target's own posts.
 * Inbound mentions (others tweeting at/about the target) are counted in `scope`
 * but never mixed into posting velocity or composition.
 */
export function computeAnalytics(profile: Profile, posts: Post[], edges: Edge[]): ReportAnalytics {
  const { own, inbound } = partitionPosts(profile, posts)
  const total = own.length
  const withTimes = own
    .map((p) => ({ p, t: Date.parse(p.createdAt) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t) // ascending by time

  // ——— Fundamentals ———
  const ageMs = profile.accountCreated ? Date.now() - Date.parse(profile.accountCreated) : 0
  const accountAgeDays = ageMs > 0 ? Math.floor(ageMs / DAY_MS) : 0
  const lifetimeVelocity = accountAgeDays > 0 ? round(profile.metrics.posts / accountAgeDays) : 0
  const followerFollowingRatio = profile.metrics.following > 0
    ? round(profile.metrics.followers / profile.metrics.following)
    : profile.metrics.followers

  // ——— Composition ———
  const byKind: Record<PostKind, number> = { original: 0, reply: 0, quote: 0, retweet: 0 }
  const byKindPct: Record<PostKind, number> = { original: 0, reply: 0, quote: 0, retweet: 0 }
  let withMedia = 0
  let withLink = 0
  const langCounts = new Map<string, number>()
  for (const p of own) {
    byKind[p.kind] += 1
    if (p.mediaKeys.length > 0) withMedia += 1
    if (p.urls.length > 0) withLink += 1
    langCounts.set(p.lang, (langCounts.get(p.lang) ?? 0) + 1)
  }
  for (const k of POST_KINDS) byKindPct[k] = total > 0 ? round((byKind[k] / total) * 100, 1) : 0

  // ——— Engagement ———
  const collect = (sel: (p: Post) => number) => own.map(sel)
  const impressions = statsFor(collect((p) => p.metrics.impressions))
  const likes = statsFor(collect((p) => p.metrics.likes))
  const reposts = statsFor(collect((p) => p.metrics.reposts))
  const replies = statsFor(collect((p) => p.metrics.replies))
  const quotes = statsFor(collect((p) => p.metrics.quotes))
  const bookmarks = statsFor(collect((p) => p.metrics.bookmarks))
  const rate = (num: number) => (impressions.total > 0 ? round(num / impressions.total, 4) : 0)

  const performanceByKind: Record<PostKind, number> = { original: 0, reply: 0, quote: 0, retweet: 0 }
  for (const k of POST_KINDS) {
    const inKind = own.filter((p) => p.kind === k)
    performanceByKind[k] = inKind.length > 0
      ? round(inKind.reduce((a, p) => a + p.metrics.likes, 0) / inKind.length)
      : 0
  }
  let bestPostId: string | null = null
  let worstPostId: string | null = null
  let bestLikes = -1
  let worstLikes = Infinity
  for (const p of own) {
    if (p.metrics.likes > bestLikes) { bestLikes = p.metrics.likes; bestPostId = p.id }
    if (p.metrics.impressions > 0 && p.metrics.likes < worstLikes) { worstLikes = p.metrics.likes; worstPostId = p.id }
  }
  const topDecileLikes = percentile([...collect((p) => p.metrics.likes)].sort((a, b) => a - b), 90)

  // ——— Cadence ———
  const hourHistogramUtc = new Array(24).fill(0)
  const weekdayHistogram = new Array(7).fill(0)
  for (const { t } of withTimes) {
    const d = new Date(t)
    hourHistogramUtc[d.getUTCHours()] += 1
    weekdayHistogram[d.getUTCDay()] += 1
  }
  const spanMs = withTimes.length >= 2 ? withTimes[withTimes.length - 1].t - withTimes[0].t : 0
  const spanDays = spanMs > 0 ? round(spanMs / DAY_MS) : 0
  const avgPerDay = spanDays > 0 ? round(total / spanDays) : total
  let longestGapMs = 0
  for (let i = 1; i < withTimes.length; i++) {
    longestGapMs = Math.max(longestGapMs, withTimes[i].t - withTimes[i - 1].t)
  }
  const maxHour = Math.max(0, ...hourHistogramUtc)
  const peakHoursUtc = hourHistogramUtc
    .map((c, h) => ({ c, h }))
    .filter((x) => x.c > 0 && x.c >= maxHour * 0.8)
    .map((x) => x.h)
  const { pattern, variance } = classifyCadence(withTimes.map((x) => x.t))

  // ——— Topics (X's own annotations) ———
  const domainCounts = new Map<string, number>()
  const entityCounts = new Map<string, number>()
  for (const p of own) {
    for (const c of p.contextAnnotations) {
      if (c.domain) domainCounts.set(c.domain, (domainCounts.get(c.domain) ?? 0) + 1)
      if (c.entity) entityCounts.set(c.entity, (entityCounts.get(c.entity) ?? 0) + 1)
    }
  }

  // ——— Info diet (linked domains) ———
  const dietCounts = new Map<string, number>()
  for (const p of own) {
    for (const u of p.urls) {
      const host = hostname(u.expanded)
      if (host && !host.endsWith('t.co')) dietCounts.set(host, (dietCounts.get(host) ?? 0) + 1)
    }
  }

  // ——— Network (from posts + derived edges) ———
  const mentionCounts = new Map<string, number>()
  const replyCounts = new Map<string, number>()
  for (const p of own) {
    for (const m of p.mentions) mentionCounts.set(m.username, (mentionCounts.get(m.username) ?? 0) + 1)
    if (p.kind === 'reply') {
      for (const m of p.mentions) replyCounts.set(m.username, (replyCounts.get(m.username) ?? 0) + 1)
    }
  }
  const quoteCounts = new Map<string, number>()
  for (const e of edges) {
    if (e.kind === 'quote') {
      const key = e.targetUsername || e.target
      quoteCounts.set(key, (quoteCounts.get(key) ?? 0) + e.weight)
    }
  }

  return {
    fundamentals: {
      accountAgeDays,
      lifetimeVelocity,
      followers: profile.metrics.followers,
      following: profile.metrics.following,
      followerFollowingRatio,
      followRatioLabel: followLabel(followerFollowingRatio, profile.metrics.following),
      listed: profile.metrics.listed,
      pinnedPostId: profile.pinnedPostId,
    },
    composition: {
      total,
      byKind,
      byKindPct,
      withMediaPct: total > 0 ? round((withMedia / total) * 100, 1) : 0,
      withLinkPct: total > 0 ? round((withLink / total) * 100, 1) : 0,
      langMix: rank(langCounts),
    },
    engagement: {
      impressions,
      likes,
      reposts,
      replies,
      quotes,
      bookmarks,
      engagementRate: rate(likes.total),
      bookmarkRate: rate(bookmarks.total),
      amplificationRate: rate(reposts.total),
      performanceByKind,
      bestPostId,
      worstPostId,
      topDecileLikes,
    },
    cadence: {
      pattern,
      variance,
      avgPerDay,
      spanDays,
      hourHistogramUtc,
      weekdayHistogram,
      peakHoursUtc,
      longestGapHours: round(longestGapMs / HOUR_MS, 1),
    },
    topics: {
      domains: rank(domainCounts),
      entities: rank(entityCounts),
    },
    infoDiet: {
      domains: rank(dietCounts),
    },
    network: {
      topMentioned: rank(mentionCounts),
      topQuoted: rank(quoteCounts),
      topReplied: rank(replyCounts),
    },
    scope: {
      ownPosts: own.length,
      inboundMentions: inbound.length,
    },
    computedAt: new Date().toISOString(),
  }
}

/**
 * The [oldest, newest] ISO timestamps across posts, or null when none have
 * valid timestamps. Used for a snapshot's meta.dateRange.
 */
export function postDateRange(posts: Post[]): { from: string; to: string } | null {
  const times = posts.map((p) => Date.parse(p.createdAt)).filter((t) => Number.isFinite(t))
  if (times.length === 0) return null
  return { from: new Date(Math.min(...times)).toISOString(), to: new Date(Math.max(...times)).toISOString() }
}

function pctDelta(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 100
  return round(((to - from) / Math.abs(from)) * 100, 1)
}

function labelSet(items: RankedCount[]): Set<string> {
  return new Set(items.map((i) => i.label))
}

/**
 * Deterministically diff two frozen analytics objects. Produces the computed
 * portion of a ChangeSummary; the LLM narrative is filled in separately. Pure.
 *
 * @param addedOwn newly gathered posts authored by the target
 * @param addedInbound newly gathered inbound mentions of the target
 * @param inboundIntervalCutoff ISO timestamp of when the previous report ran
 *   (its createdAt). Newly gathered inbound mentions timestamped AFTER this are
 *   genuine new attention since the last report; those timestamped ON/BEFORE it
 *   are historical backfill (older mentions only now captured), NOT activity in
 *   the interval. Pass null only for a baseline with no previous report.
 */
export function computeDelta(
  prev: ReportAnalytics,
  curr: ReportAnalytics,
  addedOwn: Post[],
  addedInbound: Post[],
  inboundIntervalCutoff: string | null = null,
): Omit<ChangeSummary, 'narrative'> {
  const newPostIds = [...addedOwn, ...addedInbound].map((p) => p.id)
  const dateRangeAddedOwn = postDateRange(addedOwn)
  const dateRangeAddedInbound = postDateRange(addedInbound)
  const dateRangeAdded = postDateRange([...addedOwn, ...addedInbound])

  // Split newly gathered inbound mentions into genuine in-interval attention vs
  // historical backfill, using the previous report's newest inbound timestamp.
  const cutoffMs = inboundIntervalCutoff ? Date.parse(inboundIntervalCutoff) : NaN
  const inboundInInterval: Post[] = []
  const inboundBackfilled: Post[] = []
  for (const p of addedInbound) {
    const t = Date.parse(p.createdAt)
    // No usable cutoff (no prior inbound) or newer than cutoff => genuinely new.
    if (!Number.isFinite(cutoffMs) || (Number.isFinite(t) && t > cutoffMs)) {
      inboundInInterval.push(p)
    } else {
      inboundBackfilled.push(p)
    }
  }
  const dateRangeAddedInboundInInterval = postDateRange(inboundInInterval)
  const dateRangeAddedInboundBackfilled = postDateRange(inboundBackfilled)
  const metricShifts = [
    { metric: 'engagementRate', from: prev.engagement.engagementRate, to: curr.engagement.engagementRate },
    { metric: 'bookmarkRate', from: prev.engagement.bookmarkRate, to: curr.engagement.bookmarkRate },
    { metric: 'amplificationRate', from: prev.engagement.amplificationRate, to: curr.engagement.amplificationRate },
    { metric: 'avgLikes', from: prev.engagement.likes.avg, to: curr.engagement.likes.avg },
    { metric: 'avgImpressions', from: prev.engagement.impressions.avg, to: curr.engagement.impressions.avg },
    { metric: 'followers', from: prev.fundamentals.followers, to: curr.fundamentals.followers },
    { metric: 'avgPerDay', from: prev.cadence.avgPerDay, to: curr.cadence.avgPerDay },
  ].map((s) => ({ ...s, deltaPct: pctDelta(s.from, s.to) }))

  const compositionDrift: string[] = []
  for (const k of POST_KINDS) {
    const d = round(curr.composition.byKindPct[k] - prev.composition.byKindPct[k], 1)
    if (Math.abs(d) >= 5) {
      compositionDrift.push(`${k} ${prev.composition.byKindPct[k]}% -> ${curr.composition.byKindPct[k]}% (${d > 0 ? '+' : ''}${d}pt)`)
    }
  }
  const mediaD = round(curr.composition.withMediaPct - prev.composition.withMediaPct, 1)
  if (Math.abs(mediaD) >= 5) compositionDrift.push(`media use ${mediaD > 0 ? '+' : ''}${mediaD}pt`)

  const cadenceDrift: string[] = []
  if (prev.cadence.pattern !== curr.cadence.pattern) {
    cadenceDrift.push(`rhythm ${prev.cadence.pattern} -> ${curr.cadence.pattern}`)
  }
  const prevPeak = prev.cadence.peakHoursUtc[0]
  const currPeak = curr.cadence.peakHoursUtc[0]
  if (prevPeak != null && currPeak != null && prevPeak !== currPeak) {
    cadenceDrift.push(`peak hour ${prevPeak}:00 -> ${currPeak}:00 UTC`)
  }
  const velD = pctDelta(prev.cadence.avgPerDay, curr.cadence.avgPerDay)
  if (Math.abs(velD) >= 15) cadenceDrift.push(`posting velocity ${velD > 0 ? '+' : ''}${velD}%`)

  const prevTopics = labelSet(prev.topics.entities)
  const currTopics = labelSet(curr.topics.entities)
  const emergingTopics = [...currTopics].filter((t) => !prevTopics.has(t))
  const fadingTopics = [...prevTopics].filter((t) => !currTopics.has(t))
  const sustainedTopics = [...currTopics].filter((t) => prevTopics.has(t))

  const prevNet = labelSet(prev.network.topMentioned)
  const currNet = labelSet(curr.network.topMentioned)
  const appeared = [...currNet].filter((n) => !prevNet.has(n))
  const disappeared = [...prevNet].filter((n) => !currNet.has(n))

  return {
    volumeAdded: newPostIds.length,
    volumeAddedOwn: addedOwn.length,
    volumeAddedInbound: addedInbound.length,
    volumeAddedInboundInInterval: inboundInInterval.length,
    volumeAddedInboundBackfilled: inboundBackfilled.length,
    dateRangeAdded,
    dateRangeAddedOwn,
    dateRangeAddedInbound,
    dateRangeAddedInboundInInterval,
    dateRangeAddedInboundBackfilled,
    metricShifts,
    compositionDrift,
    cadenceDrift,
    emergingTopics,
    fadingTopics,
    sustainedTopics,
    networkChanges: { appeared, disappeared },
  }
}

/**
 * Classify posting rhythm from the coefficient of variation of inter-post
 * intervals. High CoV = bursty; low = steady.
 */
function classifyCadence(timesAsc: number[]): { pattern: CadencePattern; variance: CadenceVariance } {
  if (timesAsc.length < 3) return { pattern: 'steady', variance: 'low' }
  const gaps: number[] = []
  for (let i = 1; i < timesAsc.length; i++) gaps.push(timesAsc[i] - timesAsc[i - 1])
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  if (mean === 0) return { pattern: 'burst', variance: 'high' }
  const varSum = gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length
  const cov = Math.sqrt(varSum) / mean
  const variance: CadenceVariance = cov >= 1.2 ? 'high' : cov >= 0.6 ? 'medium' : 'low'
  const pattern: CadencePattern = cov >= 1 ? 'burst' : 'steady'
  return { pattern, variance }
}