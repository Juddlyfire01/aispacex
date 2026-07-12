# Post Performance Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Post → **Performance**: glance KPIs, ranked Top posts (hybrid eligibility + rank filters), and a patterns strip for the active compose profile.

**Architecture:** Pure scoring in `src/lib/x-intel/performance.ts` over gathered intel `Post`s; compose-owned UI under `src/components/compose/performance-*` that resolves the active thread/`newThreadContext` profile and reads self/target stores. Wire into `ComposeWorkspace` by labeling the empty Feed slot **Performance** and mounting the view. No new X gathers, no LLM, no Network tab work.

**Tech Stack:** TypeScript, React, Zustand (`compose-store`, `x-self-store`, `x-intel-store`), Vitest, existing `PillGroup` / report `Stat`-style chrome.

**Spec:** `docs/superpowers/specs/2026-07-12-post-performance-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/x-intel/performance.ts` | Window filter, per-mode metrics, composite, hybrid eligibility, top-list build, glance, patterns, why templates, amplifiers from inbound posts |
| `src/lib/x-intel/performance.test.ts` | Unit tests for all pure logic |
| `src/lib/compose/performance-context.ts` | Resolve compose profile scope → `{ profile, posts, inbound }` from stores; empty reasons |
| `src/lib/compose/performance-context.test.ts` | Scope precedence tests (pure helpers; inject fixtures, no Zustand required) |
| `src/components/compose/performance-view.tsx` | Pane shell: local window/rank/expanded state; empty states; compose children |
| `src/components/compose/performance-controls.tsx` | Window + rank `PillGroup`s |
| `src/components/compose/performance-glance.tsx` | 3–4 KPI cells |
| `src/components/compose/top-posts-list.tsx` | Accordion Top posts list + why + amplifiers + X link |
| `src/components/compose/performance-patterns.tsx` | By-kind bars + example posts + caption |
| `src/components/compose/compose-workspace.tsx` | Sub-tab label `Performance`; mount `PerformanceView` instead of Feed placeholder |

**Locked constants (do not retune without updating tests + spec):**

```ts
export const PERF_TOP_LIST_CAP = 10
export const PERF_FILL_MIN = 3
export const PERF_RELATIVE_MULT = 1.5
export const PERF_COMPOSITE_WEIGHTS = { rate: 0.5, amp: 0.35, likes: 0.15 } as const
```

Absolute floors (spec §5.3):

- Likes / composite likes check: `likes >= max(5, min(50, Math.round(followers * 0.001)))`
- Amplification: `reposts + quotes >= 2`
- Engagement rate: `impressions >= 100` and rate ≥ median rate among rate-scorable candidates

Relative bar: `metric >= Math.max(median * 1.5, p75)` among scorable candidates for the active mode.

---

### Task 1: Types, window filter, per-mode raw metrics

**Files:**
- Create: `src/lib/x-intel/performance.ts`
- Create: `src/lib/x-intel/performance.test.ts`
- Use: `src/lib/intel-library/test-fixtures.ts` (`makePost`, `makeProfile`)
- Use: `src/lib/x-intel/activity.ts` (`partitionPosts`) — only in later loaders; tests build own arrays directly

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { makePost } from '../intel-library/test-fixtures'
import {
  filterPostsByWindow,
  postEngagementRate,
  postAmplification,
  type PerformanceWindow,
} from './performance'

const NOW = Date.parse('2026-07-12T12:00:00.000Z')

describe('filterPostsByWindow', () => {
  const recent = makePost({ id: 'r', createdAt: '2026-07-10T12:00:00.000Z' })
  const mid = makePost({ id: 'm', createdAt: '2026-06-20T12:00:00.000Z' })
  const old = makePost({ id: 'o', createdAt: '2026-01-01T12:00:00.000Z' })

  it('keeps 7d / 30d / all correctly', () => {
    expect(filterPostsByWindow([recent, mid, old], '7d', NOW).map((p) => p.id)).toEqual(['r'])
    expect(filterPostsByWindow([recent, mid, old], '30d', NOW).map((p) => p.id).sort()).toEqual(['m', 'r'])
    expect(filterPostsByWindow([recent, mid, old], 'all', NOW)).toHaveLength(3)
  })

  it('drops invalid createdAt', () => {
    const bad = makePost({ id: 'b', createdAt: 'not-a-date' })
    expect(filterPostsByWindow([bad], 'all', NOW)).toEqual([])
  })
})

describe('per-post metrics', () => {
  it('computes engagement rate and amplification', () => {
    const p = makePost({
      metrics: { impressions: 1000, likes: 40, reposts: 5, replies: 3, quotes: 2, bookmarks: 1 },
    })
    expect(postEngagementRate(p)).toBeCloseTo(50 / 1000)
    expect(postAmplification(p)).toBe(7)
  })

  it('engagement rate is 0 when impressions are 0', () => {
    expect(postEngagementRate(makePost({ metrics: { impressions: 0, likes: 10 } }))).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/lib/x-intel/performance.test.ts`

Expected: FAIL (module / exports missing)

- [ ] **Step 3: Minimal implementation**

Create `src/lib/x-intel/performance.ts`:

```ts
import type { Post, PostKind, Profile } from './types'

export type PerformanceWindow = '7d' | '30d' | 'all'
export type PerformanceRankMode = 'engagement_rate' | 'amplification' | 'likes' | 'composite'

export const PERF_TOP_LIST_CAP = 10
export const PERF_FILL_MIN = 3
export const PERF_RELATIVE_MULT = 1.5
export const PERF_COMPOSITE_WEIGHTS = { rate: 0.5, amp: 0.35, likes: 0.15 } as const

const DAY_MS = 86_400_000

export function filterPostsByWindow(
  posts: Post[],
  window: PerformanceWindow,
  nowMs: number = Date.now(),
): Post[] {
  if (window === 'all') {
    return posts.filter((p) => Number.isFinite(Date.parse(p.createdAt)))
  }
  const days = window === '7d' ? 7 : 30
  const cutoff = nowMs - days * DAY_MS
  return posts.filter((p) => {
    const t = Date.parse(p.createdAt)
    return Number.isFinite(t) && t >= cutoff
  })
}

export function postEngagementRate(p: Post): number {
  const impr = p.metrics.impressions
  if (impr <= 0) return 0
  const n =
    p.metrics.likes + p.metrics.reposts + p.metrics.replies + p.metrics.quotes
  return n / impr
}

export function postAmplification(p: Post): number {
  return p.metrics.reposts + p.metrics.quotes
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/lib/x-intel/performance.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/x-intel/performance.ts src/lib/x-intel/performance.test.ts
git commit -m "feat(performance): add window filter and per-post metrics"
```

---

### Task 2: Scoring, eligibility, ranked top list

**Files:**
- Modify: `src/lib/x-intel/performance.ts`
- Modify: `src/lib/x-intel/performance.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `performance.test.ts`:

```ts
import {
  // ...existing
  scorePost,
  isEligibleTopPost,
  buildTopPosts,
  medianOf,
  percentileAsc,
  likesFloor,
} from './performance'
import { makeProfile } from '../intel-library/test-fixtures'

describe('stats helpers', () => {
  it('median and p75', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5)
    expect(percentileAsc([1, 2, 3, 4], 75)).toBe(3)
  })
})

describe('likesFloor', () => {
  it('scales with followers and clamps', () => {
    expect(likesFloor(0)).toBe(5)
    expect(likesFloor(10_000)).toBe(10)
    expect(likesFloor(1_000_000)).toBe(50)
  })
})

describe('scorePost + eligibility + buildTopPosts', () => {
  const authorId = 'user-1'
  const profile = makeProfile('alice')
  profile.id = authorId
  profile.metrics.followers = 10_000

  function own(partial: Parameters<typeof makePost>[0]): Post {
    return makePost({ authorId, kind: 'original', ...partial })
  }

  it('excludes zero-impression posts from engagement_rate ranking set', () => {
    const posts = [
      own({ id: 'a', metrics: { impressions: 0, likes: 100 } }),
      own({ id: 'b', metrics: { impressions: 1000, likes: 50, reposts: 10, replies: 5, quotes: 5 } }),
    ]
    const result = buildTopPosts({
      posts,
      profile,
      window: 'all',
      mode: 'engagement_rate',
      nowMs: NOW,
    })
    expect(result.scored.map((s) => s.post.id)).toEqual(['b'])
  })

  it('marks eligible vs below-threshold fill when fewer than 3 clear tops', () => {
    const posts = [
      own({
        id: 'star',
        metrics: { impressions: 10_000, likes: 500, reposts: 80, replies: 40, quotes: 20 },
      }),
      own({
        id: 'ok',
        metrics: { impressions: 2000, likes: 20, reposts: 1, replies: 1, quotes: 0 },
      }),
      own({
        id: 'meh',
        metrics: { impressions: 1500, likes: 8, reposts: 0, replies: 0, quotes: 0 },
      }),
    ]
    const result = buildTopPosts({
      posts,
      profile,
      window: 'all',
      mode: 'likes',
      nowMs: NOW,
    })
    expect(result.items[0].post.id).toBe('star')
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items.length).toBeLessThanOrEqual(PERF_TOP_LIST_CAP)
    // With a clear winner and weak peers, fills may be belowThreshold
    const fills = result.items.filter((i) => i.belowThreshold)
    expect(fills.every((i) => i.post.id !== 'star')).toBe(true)
  })

  it('composite uses weighted normalized terms', () => {
    const posts = [
      own({ id: '1', metrics: { impressions: 1000, likes: 100, reposts: 10, quotes: 10, replies: 0 } }),
      own({ id: '2', metrics: { impressions: 1000, likes: 10, reposts: 1, quotes: 0, replies: 0 } }),
    ]
    const s1 = scorePost(
      posts[0],
      'composite',
      { rateMed: 0.05, ampMed: 5, likesMed: 20 },
    )
    const s2 = scorePost(
      posts[1],
      'composite',
      { rateMed: 0.05, ampMed: 5, likesMed: 20 },
    )
    expect(s1).toBeGreaterThan(s2)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/lib/x-intel/performance.test.ts`

- [ ] **Step 3: Implement scoring + buildTopPosts**

Add to `performance.ts` (complete logic — no stubs):

```ts
export function medianOf(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

/** Same indexing style as analytics.ts percentile helper. */
export function percentileAsc(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.floor((p / 100) * sortedAsc.length),
  )
  return sortedAsc[idx]
}

export function likesFloor(followers: number): number {
  return Math.max(5, Math.min(50, Math.round(followers * 0.001)))
}

export type CompositeMedians = { rateMed: number; ampMed: number; likesMed: number }

export function rawMetric(p: Post, mode: PerformanceRankMode): number {
  if (mode === 'engagement_rate') return postEngagementRate(p)
  if (mode === 'amplification') return postAmplification(p)
  if (mode === 'likes') return p.metrics.likes
  // composite raw not used for eligibility alone — scorePost handles blend
  return 0
}

export function scorePost(
  p: Post,
  mode: PerformanceRankMode,
  medians: CompositeMedians,
): number {
  if (mode === 'engagement_rate') return postEngagementRate(p)
  if (mode === 'amplification') return postAmplification(p)
  if (mode === 'likes') return p.metrics.likes

  const rate = postEngagementRate(p)
  const amp = postAmplification(p)
  const likes = p.metrics.likes
  const terms: { w: number; n: number }[] = []
  if (medians.rateMed > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.rate, n: rate / medians.rateMed })
  } else if (rate > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.rate, n: 1 })
  }
  if (medians.ampMed > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.amp, n: amp / medians.ampMed })
  } else if (amp > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.amp, n: 1 })
  }
  if (medians.likesMed > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.likes, n: likes / medians.likesMed })
  } else if (likes > 0) {
    terms.push({ w: PERF_COMPOSITE_WEIGHTS.likes, n: 1 })
  }
  if (terms.length === 0) return 0
  const wSum = terms.reduce((a, t) => a + t.w, 0)
  return terms.reduce((a, t) => a + (t.w / wSum) * t.n, 0)
}

export function isRateScorable(p: Post): boolean {
  return p.metrics.impressions > 0
}

export function absoluteFloorOk(
  p: Post,
  mode: PerformanceRankMode,
  followers: number,
  rateMedian: number,
): boolean {
  if (mode === 'likes' || mode === 'composite') {
    return p.metrics.likes >= likesFloor(followers)
  }
  if (mode === 'amplification') {
    return postAmplification(p) >= 2
  }
  // engagement_rate
  return p.metrics.impressions >= 100 && postEngagementRate(p) >= rateMedian
}

export function relativeOk(metric: number, values: number[]): boolean {
  if (values.length === 0) return false
  const sorted = [...values].sort((a, b) => a - b)
  const med = medianOf(sorted)
  const p75 = percentileAsc(sorted, 75)
  const bar = Math.max(med * PERF_RELATIVE_MULT, p75)
  return metric >= bar
}

export interface ScoredPost {
  post: Post
  score: number
  metricForMode: number
  multipleOfMedian: number | null
  belowThreshold: boolean
  why: string
  amplifiers: string[]
}

export interface TopPostsResult {
  candidates: Post[]
  scored: ScoredPost[]
  items: ScoredPost[]
  eligibleCount: number
  medianMetric: number
  mode: PerformanceRankMode
}

export function buildTopPosts(opts: {
  posts: Post[]
  profile: Profile
  window: PerformanceWindow
  mode: PerformanceRankMode
  nowMs?: number
  inbound?: Post[]
}): TopPostsResult {
  const nowMs = opts.nowMs ?? Date.now()
  const candidates = filterPostsByWindow(opts.posts, opts.window, nowMs)
  const mode = opts.mode

  const scorable =
    mode === 'engagement_rate' ? candidates.filter(isRateScorable) : candidates

  const rateValues = scorable.map(postEngagementRate)
  const ampValues = scorable.map(postAmplification)
  const likesValues = scorable.map((p) => p.metrics.likes)
  const medians: CompositeMedians = {
    rateMed: medianOf(rateValues),
    ampMed: medianOf(ampValues),
    likesMed: medianOf(likesValues),
  }

  const metricValues =
    mode === 'composite'
      ? scorable.map((p) => scorePost(p, 'composite', medians))
      : mode === 'engagement_rate'
        ? rateValues
        : mode === 'amplification'
          ? ampValues
          : likesValues

  const medianMetric = medianOf(metricValues)
  const rateMedian = medians.rateMed

  const scored: ScoredPost[] = scorable
    .map((post) => {
      const score = scorePost(post, mode, medians)
      const metricForMode =
        mode === 'composite' ? score : rawMetric(post, mode)
      const multipleOfMedian =
        medianMetric > 0 ? Math.round((metricForMode / medianMetric) * 10) / 10 : null
      const eligible =
        relativeOk(metricForMode, metricValues) &&
        absoluteFloorOk(post, mode, opts.profile.metrics.followers, rateMedian)
      return {
        post,
        score,
        metricForMode,
        multipleOfMedian,
        belowThreshold: !eligible,
        why: '', // Task 3
        amplifiers: [], // Task 3
      }
    })
    .sort((a, b) => b.score - a.score || b.post.metrics.likes - a.post.metrics.likes)

  const eligible = scored.filter((s) => !s.belowThreshold)
  const items: ScoredPost[] = [...eligible]
  if (items.length < PERF_FILL_MIN) {
    for (const s of scored) {
      if (items.length >= PERF_FILL_MIN) break
      if (!items.some((i) => i.post.id === s.post.id)) items.push({ ...s, belowThreshold: true })
    }
  }
  const capped = items.slice(0, PERF_TOP_LIST_CAP)

  return {
    candidates,
    scored,
    items: capped,
    eligibleCount: eligible.length,
    medianMetric,
    mode,
  }
}
```

Wire `why` / `amplifiers` as empty strings/arrays for now; Task 3 fills them inside `buildTopPosts` (or a thin `decorateTopPosts` called at the end of `buildTopPosts`).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/lib/x-intel/performance.test.ts`

Fix any assertion drift (eligibility thresholds are deterministic — adjust fixture metrics, not constants).

- [ ] **Step 5: Commit**

```bash
git add src/lib/x-intel/performance.ts src/lib/x-intel/performance.test.ts
git commit -m "feat(performance): score modes, hybrid eligibility, top list"
```

---

### Task 3: Why templates, amplifiers, glance, patterns

**Files:**
- Modify: `src/lib/x-intel/performance.ts`
- Modify: `src/lib/x-intel/performance.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import {
  formatWhy,
  amplifiersForPost,
  buildGlance,
  buildPatterns,
  MODE_LABEL,
} from './performance'

describe('formatWhy', () => {
  it('mentions multiple and floor for eligible likes mode', () => {
    const text = formatWhy({
      mode: 'likes',
      multipleOfMedian: 3.2,
      belowThreshold: false,
    })
    expect(text.toLowerCase()).toContain('3.2')
    expect(text.toLowerCase()).toMatch(/median|likes/)
  })

  it('marks below-threshold fills', () => {
    expect(formatWhy({ mode: 'likes', multipleOfMedian: 0.8, belowThreshold: true }).toLowerCase()).toMatch(
      /below|threshold|near/,
    )
  })
})

describe('amplifiersForPost', () => {
  it('returns up to 3 inbound quote/RT author handles for this post id', () => {
    const inbound = [
      makePost({
        id: 'in1',
        authorId: 'u2',
        authorUsername: 'bob',
        referenced: [{ id: 'star', type: 'quoted', authorId: 'user-1' }],
      }),
      makePost({
        id: 'in2',
        authorId: 'u3',
        authorUsername: 'cara',
        referenced: [{ id: 'star', type: 'retweeted', authorId: 'user-1' }],
      }),
      makePost({
        id: 'in3',
        authorId: 'u4',
        authorUsername: 'dan',
        referenced: [{ id: 'other', type: 'quoted', authorId: 'user-1' }],
      }),
    ]
    expect(amplifiersForPost('star', inbound)).toEqual(['bob', 'cara'])
  })
})

describe('glance + patterns', () => {
  it('builds glance KPIs and leading kind', () => {
    const profile = makeProfile('alice')
    profile.id = 'user-1'
    profile.metrics.followers = 10_000
    const posts = [
      makePost({
        id: '1',
        authorId: 'user-1',
        kind: 'original',
        metrics: { impressions: 5000, likes: 200, reposts: 40, replies: 10, quotes: 10 },
      }),
      makePost({
        id: '2',
        authorId: 'user-1',
        kind: 'reply',
        metrics: { impressions: 800, likes: 5, reposts: 0, replies: 1, quotes: 0 },
      }),
    ]
    const top = buildTopPosts({ posts, profile, window: 'all', mode: 'composite', nowMs: NOW })
    const glance = buildGlance(top)
    expect(glance.topPostCount).toBe(top.eligibleCount)
    expect(glance.engagementRate).toBeGreaterThan(0)
    expect(['original', 'reply', 'quote', 'retweet']).toContain(glance.leadingKind)

    const patterns = buildPatterns(top.candidates, top.mode, {
      rateMed: 0.05,
      ampMed: 5,
      likesMed: 20,
    })
    expect(patterns.byKind.length).toBe(4)
    expect(patterns.examples.length).toBeGreaterThanOrEqual(1)
    expect(patterns.caption.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
export const MODE_LABEL: Record<PerformanceRankMode, string> = {
  engagement_rate: 'engagement rate',
  amplification: 'amplification',
  likes: 'likes',
  composite: 'composite score',
}

export function formatWhy(opts: {
  mode: PerformanceRankMode
  multipleOfMedian: number | null
  belowThreshold: boolean
}): string {
  const label = MODE_LABEL[opts.mode]
  if (opts.belowThreshold) {
    return `Near the top of this window on ${label}, but below the top-post threshold.`
  }
  if (opts.multipleOfMedian != null && opts.multipleOfMedian > 0) {
    return `${opts.multipleOfMedian}× this account’s median ${label}; clears the absolute floor.`
  }
  return `Clears the top-post bar on ${label} for this window.`
}

const AMP_REF_TYPES = new Set(['quoted', 'retweeted', 'reposted'])

export function amplifiersForPost(postId: string, inbound: Post[], limit = 3): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of inbound) {
    const hits = p.referenced.some((r) => r.id === postId && AMP_REF_TYPES.has(r.type))
    const handle = (p.authorUsername || '').replace(/^@/, '')
    if (!hits || !handle) continue
    const key = handle.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(handle)
    if (out.length >= limit) break
  }
  return out
}

export interface PerformanceGlance {
  engagementRate: number
  topPostCount: number
  leadingKind: PostKind
  vsMedian: number | null
}

export function buildGlance(top: TopPostsResult): PerformanceGlance {
  let likes = 0
  let reposts = 0
  let replies = 0
  let quotes = 0
  let impressions = 0
  for (const p of top.candidates) {
    likes += p.metrics.likes
    reposts += p.metrics.reposts
    replies += p.metrics.replies
    quotes += p.metrics.quotes
    impressions += p.metrics.impressions
  }
  const engagementRate =
    impressions > 0 ? (likes + reposts + replies + quotes) / impressions : 0

  const kindScores = new Map<PostKind, { sum: number; n: number }>()
  for (const k of ['original', 'reply', 'quote', 'retweet'] as PostKind[]) {
    kindScores.set(k, { sum: 0, n: 0 })
  }
  for (const s of top.scored) {
    const slot = kindScores.get(s.post.kind)!
    slot.sum += s.score
    slot.n += 1
  }
  let leadingKind: PostKind = 'original'
  let best = -1
  for (const [k, v] of kindScores) {
    if (v.n === 0) continue
    const avg = v.sum / v.n
    if (avg > best) {
      best = avg
      leadingKind = k
    }
  }

  const eligible = top.items.filter((i) => !i.belowThreshold)
  let vsMedian: number | null = null
  if (eligible.length > 0 && top.medianMetric > 0) {
    const mults = eligible
      .map((i) => i.multipleOfMedian)
      .filter((m): m is number => m != null)
    vsMedian = mults.length ? medianOf(mults) : null
  }

  return {
    engagementRate,
    topPostCount: top.eligibleCount,
    leadingKind,
    vsMedian,
  }
}

export interface PatternKindRow {
  kind: PostKind
  avgScore: number
  count: number
}

export interface PerformancePatterns {
  byKind: PatternKindRow[]
  leadingKind: PostKind
  examples: Post[]
  caption: string
}

export function buildPatterns(
  candidates: Post[],
  mode: PerformanceRankMode,
  medians: CompositeMedians,
): PerformancePatterns {
  const kinds: PostKind[] = ['original', 'reply', 'quote', 'retweet']
  const byKind: PatternKindRow[] = kinds.map((kind) => {
    const inKind = candidates.filter((p) => p.kind === kind)
    const avgScore =
      inKind.length === 0
        ? 0
        : inKind.reduce((a, p) => a + scorePost(p, mode, medians), 0) / inKind.length
    return { kind, avgScore, count: inKind.length }
  })
  const leading = [...byKind].sort((a, b) => b.avgScore - a.avgScore || b.count - a.count)[0]
  const leadingKind = leading?.kind ?? 'original'
  const examples = candidates
    .filter((p) => p.kind === leadingKind)
    .map((p) => ({ p, s: scorePost(p, mode, medians) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.p)
  const kindLabel =
    leadingKind === 'original'
      ? 'Originals'
      : leadingKind === 'reply'
        ? 'Replies'
        : leadingKind === 'quote'
          ? 'Quotes'
          : 'Reposts'
  const caption = `${kindLabel} lead on ${MODE_LABEL[mode]} in this window.`
  return { byKind, leadingKind, examples, caption }
}
```

Update `buildTopPosts` to accept `inbound` and set:

```ts
why: formatWhy({ mode, multipleOfMedian, belowThreshold: !eligible }),
amplifiers: amplifiersForPost(post.id, opts.inbound ?? []),
```

Also fix `buildGlance` to use `top.candidates` only (remove the unused `windowPosts` confusion — signature `buildGlance(top: TopPostsResult)`).

Update the glance test call accordingly.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/x-intel/performance.ts src/lib/x-intel/performance.test.ts
git commit -m "feat(performance): why lines, amplifiers, glance, patterns"
```

---

### Task 4: Compose profile resolve (pure)

**Files:**
- Create: `src/lib/compose/performance-context.ts`
- Create: `src/lib/compose/performance-context.test.ts`
- Use: `src/lib/intel-library/types.ts` (`ComposeScope`)
- Use: `src/lib/x-intel/activity.ts` (`partitionPosts`)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { resolvePerformanceSubject } from './performance-context'
import type { ComposeScope } from '../intel-library/types'
import { makePost, makeProfile } from '../intel-library/test-fixtures'
import type { IntelReport } from '../x-intel/types'

describe('resolvePerformanceSubject', () => {
  const selfProfile = makeProfile('meuser')
  selfProfile.id = 'self-1'
  const selfPosts = [makePost({ id: 's1', authorId: 'self-1' })]
  const targetProfile = makeProfile('target')
  targetProfile.id = 't-1'
  const targetPosts = [
    makePost({ id: 't1', authorId: 't-1' }),
    makePost({ id: 'in', authorId: 'other', authorUsername: 'fan' }),
  ]

  const selfAccount = {
    profile: selfProfile,
    posts: selfPosts,
    edges: [],
  }

  const reports: Record<string, { profile: typeof targetProfile; posts: typeof targetPosts }> = {
    target: { profile: targetProfile, posts: targetPosts },
  }

  it('prefers active thread me scope', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'me' },
      newThreadContext: { type: 'all' },
      selfAccount,
      findReport: () => null,
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.profile.username).toBe('meuser')
      expect(r.ownPosts).toHaveLength(1)
    }
  })

  it('uses target thread scope', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'target', username: 'target' },
      newThreadContext: { type: 'me' },
      selfAccount,
      findReport: (u) => (u === 'target' ? reports.target : null),
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.profile.username).toBe('target')
      expect(r.ownPosts.every((p) => p.authorId === 't-1')).toBe(true)
      expect(r.inbound.length).toBe(1)
    }
  })

  it('falls back from all + self', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'all' },
      newThreadContext: { type: 'all' },
      selfAccount,
      findReport: () => null,
    })
    expect(r.status).toBe('ok')
  })

  it('empty when all and no self', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'all' },
      newThreadContext: { type: 'all' },
      selfAccount: null,
      findReport: () => null,
    })
    expect(r.status).toBe('need_profile')
  })

  it('empty library when profile but no posts', () => {
    const r = resolvePerformanceSubject({
      threadScope: { type: 'me' },
      newThreadContext: { type: 'me' },
      selfAccount: { profile: selfProfile, posts: [], edges: [] },
      findReport: () => null,
    })
    expect(r.status).toBe('no_posts')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `performance-context.ts`**

```ts
import type { ComposeScope } from '../intel-library/types'
import { partitionPosts } from '../x-intel/activity'
import type { Edge, Post, Profile } from '../x-intel/types'

export type SelfAccountSlice = {
  profile: Profile | null
  posts: Post[]
  edges: Edge[]
}

export type ReportSlice = {
  profile: Profile
  posts: Post[]
  edges?: Edge[]
}

export type PerformanceSubjectOk = {
  status: 'ok'
  username: string
  profile: Profile
  ownPosts: Post[]
  inbound: Post[]
  edges: Edge[]
}

export type PerformanceSubjectResult =
  | PerformanceSubjectOk
  | { status: 'need_profile' }
  | { status: 'no_posts'; username: string }
  | { status: 'missing_target'; username: string }

export function resolvePerformanceSubject(opts: {
  threadScope: ComposeScope | null | undefined
  newThreadContext: ComposeScope
  selfAccount: SelfAccountSlice | null
  findReport: (username: string) => ReportSlice | null
}): PerformanceSubjectResult {
  const pickSelf = (): PerformanceSubjectResult => {
    const a = opts.selfAccount
    if (!a?.profile) return { status: 'need_profile' }
    const { own, inbound } = partitionPosts(a.profile, a.posts)
    if (a.posts.length === 0) return { status: 'no_posts', username: a.profile.username }
    return {
      status: 'ok',
      username: a.profile.username,
      profile: a.profile,
      ownPosts: own,
      inbound,
      edges: a.edges,
    }
  }

  const pickTarget = (username: string): PerformanceSubjectResult => {
    const handle = username.replace(/^@/, '')
    const report = opts.findReport(handle)
    if (!report) return { status: 'missing_target', username: handle }
    const { own, inbound } = partitionPosts(report.profile, report.posts)
    if (report.posts.length === 0) return { status: 'no_posts', username: handle }
    return {
      status: 'ok',
      username: handle,
      profile: report.profile,
      ownPosts: own,
      inbound,
      edges: report.edges ?? [],
    }
  }

  const tryScope = (scope: ComposeScope | null | undefined): PerformanceSubjectResult | null => {
    if (!scope) return null
    if (scope.type === 'me') return pickSelf()
    if (scope.type === 'target') return pickTarget(scope.username)
    return null // 'all' — try next
  }

  return (
    tryScope(opts.threadScope) ??
    tryScope(opts.newThreadContext) ??
    pickSelf()
  )
}
```

Note: when `threadScope` is `all`, `tryScope` returns null and we fall through to `newThreadContext`, then self — matching spec §6.1.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/compose/performance-context.ts src/lib/compose/performance-context.test.ts
git commit -m "feat(performance): resolve compose profile subject"
```

---

### Task 5: Controls + Glance UI

**Files:**
- Create: `src/components/compose/performance-controls.tsx`
- Create: `src/components/compose/performance-glance.tsx`
- Create: `src/components/compose/performance-view.tsx` (shell + empty states; list/patterns placeholders OK)

- [ ] **Step 1: Implement controls**

```tsx
import { PillGroup } from '../ui/shared'
import type { PerformanceRankMode, PerformanceWindow } from '../../lib/x-intel/performance'

const WINDOWS: { value: PerformanceWindow; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
]

const MODES: { value: PerformanceRankMode; label: string }[] = [
  { value: 'composite', label: 'Composite' },
  { value: 'engagement_rate', label: 'Eng. rate' },
  { value: 'amplification', label: 'Amplification' },
  { value: 'likes', label: 'Likes' },
]

export function PerformanceControls({
  window,
  mode,
  onWindow,
  onMode,
}: {
  window: PerformanceWindow
  mode: PerformanceRankMode
  onWindow: (w: PerformanceWindow) => void
  onMode: (m: PerformanceRankMode) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-[var(--color-border-faint)]">
      <PillGroup
        ariaLabel="Time window"
        options={WINDOWS}
        value={window}
        onChange={(v) => onWindow(v as PerformanceWindow)}
      />
      <PillGroup
        ariaLabel="Rank by"
        options={MODES}
        value={mode}
        onChange={(v) => onMode(v as PerformanceRankMode)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Implement glance**

Mirror the local `Stat` cell from `profile-report.tsx` (copy a private `PerfStat` into this file — do not export report internals). Show:

- Eng. rate as percent (`(rate * 100).toFixed(1)%`)
- Top posts count
- Leading kind (capitalize)
- vs median as `N×` or em dash if null

- [ ] **Step 3: Shell `PerformanceView`**

```tsx
// Wire stores:
// - activeThread from compose-store
// - newThreadContext from compose-store
// - active self account from x-self-store
// - findReport via findReportKey + reports from x-intel-store
//
// Local state: window default '30d', mode default 'composite', expandedId
// Reset expandedId when username / window / mode changes (useEffect)
//
// On ok: buildTopPosts({ posts: ownPosts, profile, window, mode, inbound })
//        buildGlance(top); buildPatterns(...) with medians from candidates
// Empty copy per spec §9
```

Empty copy strings (exact):

- `need_profile`: `Pick You or a target in Composer settings to see Performance.`
- `no_posts`: `No posts in library for @${username} — gather from You/Others.`
- `missing_target`: `No report loaded for @${username}.`
- window empty (`candidates.length === 0`): `No posts in this window — try 30d or All.`
- rate mode all excluded: `No posts with impressions in this window — try another rank mode.`

- [ ] **Step 4: Manual smoke in browser** optional; unit coverage already on lib. Typecheck:

Run: `npx tsc -b --pretty false` (or project’s usual `npm run build` if faster locally)

Expected: no errors in new files.

- [ ] **Step 5: Commit**

```bash
git add src/components/compose/performance-controls.tsx src/components/compose/performance-glance.tsx src/components/compose/performance-view.tsx
git commit -m "feat(performance): controls, glance, view shell"
```

---

### Task 6: Top posts list + patterns UI

**Files:**
- Create: `src/components/compose/top-posts-list.tsx`
- Create: `src/components/compose/performance-patterns.tsx`
- Modify: `src/components/compose/performance-view.tsx`

- [ ] **Step 1: `TopPostsList`**

Props: `items: ScoredPost[]`, `mode`, `expandedId`, `onExpand(id)`.

Collapsed row: truncated `post.text` (one line), kind label, primary metric for mode, optional `N×`, below-threshold muted style.

Expanded: text clamp ~280 chars, metrics row (views/likes/reposts/replies/quotes), `why`, `amplified by @a, @b` only if `amplifiers.length > 0`, link `https://x.com/i/status/${id}` via `postUrl` from `src/lib/x-intel/evidence.ts`.

Accordion: clicking a row calls `onExpand`; only one open.

- [ ] **Step 2: `PerformancePatterns`**

Horizontal or vertical bars: width % from `avgScore / max(avgScore)`.

Caption under title. Example posts as compact text + kind (reuse metric readout lightly).

- [ ] **Step 3: Mount both in `PerformanceView` below glance**

Order: controls → glance → “Top posts” heading + list → patterns.

- [ ] **Step 4: Commit**

```bash
git add src/components/compose/top-posts-list.tsx src/components/compose/performance-patterns.tsx src/components/compose/performance-view.tsx
git commit -m "feat(performance): top posts list and patterns strip"
```

---

### Task 7: Wire ComposeWorkspace sub-tab

**Files:**
- Modify: `src/components/compose/compose-workspace.tsx`

- [ ] **Step 1: Update tab config and mount**

Replace:

```ts
const POST_SUB_TABS = [
  { id: 'profile' as const, label: 'Composer' },
  { id: 'feed' as const, label: '' },
  { id: 'network' as const, label: '' },
]
```

With:

```ts
const POST_SUB_TABS = [
  { id: 'profile' as const, label: 'Composer' },
  { id: 'feed' as const, label: 'Performance' },
  { id: 'network' as const, label: '' },
]
```

Keep id `feed` to avoid broader refactors (spec allows). Import and render:

```tsx
{activeSubTab === 'feed' && <PerformanceView />}
```

Remove Feed placeholder for that branch. Network placeholder unchanged.

- [ ] **Step 2: Verify SubTabs still work** (labels non-empty for Performance)

- [ ] **Step 3: Run full unit tests**

Run: `npm test -- src/lib/x-intel/performance.test.ts src/lib/compose/performance-context.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/compose/compose-workspace.tsx
git commit -m "feat(performance): mount Performance under Post sub-tab"
```

---

### Task 8: Spec status + manual checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-07-12-post-performance-design.md` (status → Approved / Implemented when done)

- [ ] **Step 1: Manual checklist**

- [ ] Post → Performance shows for connected self with gathered posts (default 30d, composite)
- [ ] Switching Eng. rate / Amplification / Likes reorders Top posts
- [ ] 7d vs All changes the set
- [ ] Target compose thread shows that report’s performance
- [ ] `all` context falls back to self when connected
- [ ] Empty states for no profile / no posts / empty window
- [ ] Amplifier line appears only when inbound quote/RT data exists
- [ ] Network tab still placeholder; Composer unchanged

- [ ] **Step 2: Flip spec status to `Approved for implementation` was already used — set `Implemented` when checklist passes**

- [ ] **Step 3: Final commit if spec status changed**

```bash
git add docs/superpowers/specs/2026-07-12-post-performance-design.md
git commit -m "docs: mark post performance spec implemented"
```

---

## Self-review (plan vs spec)

| Spec section | Task(s) |
|--------------|---------|
| §4.1 Composer \| Performance \| Network | Task 7 |
| §4.2–4.4 Controls + glance | Tasks 5 |
| §4.5–4.7 Top posts, why, amplifiers | Tasks 2–3, 6 |
| §4.8 Patterns | Tasks 3, 6 |
| §5 Scoring / hybrid / floors | Tasks 1–2 |
| §6 Profile scope + stores | Task 4–5 |
| §9 Empty states | Task 5 |
| §10 Out of scope | Honored (no Network, no LLM, no publish tracking) |

No TBD placeholders remain. Types (`PerformanceWindow`, `PerformanceRankMode`, `ScoredPost`, `resolvePerformanceSubject`) are consistent across tasks.
