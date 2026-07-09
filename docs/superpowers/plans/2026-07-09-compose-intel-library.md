# Compose Intel Library (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the compose agent dual access to local X intel — a budgeted hot window in every turn plus grep/glob tools over the full library — with Auto/Custom packing and live token estimates.

**Architecture:** Thin `IntelLibrary` read API over existing Zustand stores (no storage rewrite). `HotWindowPacker` ranks posts/reports into a token budget. Compose uses a Venice tool-call loop (playground pattern, non-streaming rounds) then final assistant text + existing `postdraft` parse. UI adds Auto/Custom knobs and a token meter on the Post tab.

**Tech Stack:** React 19, Zustand, Vitest, Venice `/chat/completions` function calling, existing encrypted `x-intel-store` / `x-self-store`.

**Spec:** `docs/superpowers/specs/2026-07-09-compose-intel-library-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/lib/intel-library/types.ts` | Scope, subject, snapshot, query types |
| `src/lib/intel-library/from-stores.ts` | Build `IntelSnapshot` from self + target store data |
| `src/lib/intel-library/library.ts` | Pure read API: list, get, grep, glob, counts |
| `src/lib/intel-library/format.ts` | Serialize profile/post/report for hot text + tool results |
| `src/lib/intel-library/*.test.ts` | Unit tests for library |
| `src/lib/compose/token-estimate.ts` | `estimateTokens`, budget math, model context limit |
| `src/lib/compose/hot-window.ts` | Packer Auto/Custom |
| `src/lib/compose/hot-window.test.ts` | Packer tests |
| `src/lib/compose/token-estimate.test.ts` | Budget tests |
| `src/lib/compose/intel-tools.ts` | OpenAI tool schemas + `executeIntelTool` |
| `src/lib/compose/intel-tools.test.ts` | Tool executor tests |
| `src/lib/compose/compose-agent.ts` | Multi-round tool loop (non-stream) |
| `src/lib/compose/compose-agent.test.ts` | Mocked Venice loop tests |
| `src/lib/compose/compose-prompt.ts` | Static system + hot-block helpers (replace corpus dump) |
| `src/types/venice.ts` | Extend messages/request for tools |
| `src/stores/compose-store.ts` | `libraryMode`, `budgetPct`, `dayWindowDays`, tool activity |
| `src/hooks/use-compose.ts` | Wire packer + agent + Custom block |
| `src/components/compose/library-meter.tsx` | Token meter + Auto/Custom controls |
| `src/components/compose/compose-workspace.tsx` | Drop `buildCorpus` dump; use library + meter |
| `src/components/compose/compose-chat.tsx` | New send signature; empty-state copy; over-budget UX |
| `src/lib/compose/build-corpus.ts` | Deprecate: re-export packer helper or delete after migration |

---

### Task 1: Token estimate & budget helpers

**Files:**
- Create: `src/lib/compose/token-estimate.ts`
- Create: `src/lib/compose/token-estimate.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/compose/token-estimate.test.ts
import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  resolveContextLimit,
  computeHotBudget,
  DEFAULT_CONTEXT_FALLBACK,
  DEFAULT_BUDGET_PCT,
} from './token-estimate'
import type { VeniceModel } from '../../types/venice'

describe('estimateTokens', () => {
  it('uses ceil(chars/4)', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })
})

describe('resolveContextLimit', () => {
  it('reads availableContextTokens from model_spec', () => {
    const m: VeniceModel = {
      id: 'grok-big',
      object: 'model',
      created: 0,
      owned_by: 'x',
      model_spec: { availableContextTokens: 1_000_000 },
    }
    expect(resolveContextLimit(m)).toBe(1_000_000)
  })

  it('falls back when missing', () => {
    expect(resolveContextLimit(undefined)).toBe(DEFAULT_CONTEXT_FALLBACK)
    expect(resolveContextLimit({ id: 'x', object: 'model', created: 0, owned_by: 'v' })).toBe(
      DEFAULT_CONTEXT_FALLBACK,
    )
  })
})

describe('computeHotBudget', () => {
  it('applies pct after reserved overhead', () => {
    // context 100_000, reserved min(8000, 10%) = 8000, usable 92000, 50% => 46000
    expect(computeHotBudget(100_000, 0.5)).toBe(46_000)
  })

  it('clamps budgetPct to 0.25–0.75', () => {
    const low = computeHotBudget(100_000, 0.1)
    const high = computeHotBudget(100_000, 0.9)
    expect(low).toBe(computeHotBudget(100_000, 0.25))
    expect(high).toBe(computeHotBudget(100_000, 0.75))
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/lib/compose/token-estimate.test.ts
```

Expected: module not found / export errors.

- [ ] **Step 3: Implement**

```typescript
// src/lib/compose/token-estimate.ts
import type { VeniceModel } from '../../types/venice'

export const DEFAULT_CONTEXT_FALLBACK = 128_000
export const DEFAULT_BUDGET_PCT = 0.5

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function resolveContextLimit(model: VeniceModel | undefined | null): number {
  const n = model?.model_spec?.availableContextTokens
  if (typeof n === 'number' && n > 0) return n
  return DEFAULT_CONTEXT_FALLBACK
}

/** Reserved for system prompt, tool schemas, and short transcript headroom. */
export function reservedOverhead(contextLimit: number): number {
  return Math.min(8_000, Math.floor(contextLimit * 0.1))
}

export function clampBudgetPct(pct: number): number {
  if (Number.isNaN(pct)) return DEFAULT_BUDGET_PCT
  return Math.min(0.75, Math.max(0.25, pct))
}

export function computeHotBudget(contextLimit: number, budgetPct: number): number {
  const pct = clampBudgetPct(budgetPct)
  const usable = Math.max(0, contextLimit - reservedOverhead(contextLimit))
  return Math.floor(usable * pct)
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/lib/compose/token-estimate.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/compose/token-estimate.ts src/lib/compose/token-estimate.test.ts
git commit -m "feat(compose): add token estimate and hot budget helpers"
```

---

### Task 2: IntelLibrary types + snapshot from fixtures

**Files:**
- Create: `src/lib/intel-library/types.ts`
- Create: `src/lib/intel-library/format.ts`
- Create: `src/lib/intel-library/test-fixtures.ts`
- Create: `src/lib/intel-library/library.ts` (stubs OK until Step 3)
- Create: `src/lib/intel-library/library.test.ts`

- [ ] **Step 1: Define types and fixtures**

```typescript
// src/lib/intel-library/types.ts
import type { Edge, IntelReportSnapshot, Post, Profile } from '../x-intel/types'

export type LibraryKind = 'self' | 'target'

export type ComposeScope =
  | { type: 'me' }
  | { type: 'target'; username: string }
  | { type: 'all' }

export interface LibrarySubject {
  kind: LibraryKind
  /** X user id when known; may equal username for targets. */
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
```

```typescript
// src/lib/intel-library/test-fixtures.ts
import type { Post, Profile, IntelReportSnapshot, Edge } from '../x-intel/types'
import type { IntelSnapshot, LibrarySubject } from './types'

export function makePost(partial: Partial<Post> & { id: string; text: string }): Post {
  return {
    authorId: 'u1',
    lang: 'en',
    createdAt: partial.createdAt ?? '2026-07-01T12:00:00.000Z',
    metrics: { impressions: 0, likes: 10, reposts: 1, replies: 0, quotes: 0, bookmarks: 0 },
    kind: 'original',
    referenced: [],
    urls: [],
    mentions: [],
    mediaKeys: [],
    contextAnnotations: [],
    gatheredAt: '2026-07-01T12:00:00.000Z',
    ...partial,
  }
}

export function makeProfile(username: string, bio = 'bio'): Profile {
  return {
    id: `id-${username}`,
    username,
    displayName: username,
    bio,
    location: null,
    url: null,
    profileImageUrl: null,
    profileBannerUrl: null,
    verified: { type: null },
    metrics: { followers: 100, following: 50, posts: 10, listed: 0 },
    createdAt: '2020-01-01T00:00:00.000Z',
    affiliation: null,
    protected: false,
  } as Profile
}

export function makeReport(id: string, summary: string): IntelReportSnapshot {
  return {
    id,
    createdAt: '2026-07-08T00:00:00.000Z',
    model: 'test',
    synthesisSettings: { contextCap: 80, temperature: 0.3, model: 'test', includedReportIds: [] },
    meta: { postCount: 1, dateRange: null, postIdsAnalyzed: [], tokenCost: 0 },
    analytics: {} as IntelReportSnapshot['analytics'],
    narrative: {
      executiveSummary: summary,
      strategicAssessment: 'strat',
      themes: [],
      register: { description: '', devices: [] },
      narrativeArcs: [],
      audienceRead: '',
      contradictions: [],
      notablePosts: [],
      engagementHooks: [],
      analystConclusions: [],
    },
    changeSummary: null,
    previousReportId: null,
  }
}

export function makeSubject(partial: Partial<LibrarySubject> & { username: string; kind: 'self' | 'target' }): LibrarySubject {
  return {
    id: partial.id ?? `id-${partial.username}`,
    profile: partial.profile ?? makeProfile(partial.username),
    posts: partial.posts ?? [],
    bookmarks: partial.bookmarks ?? [],
    likes: partial.likes ?? [],
    edges: partial.edges ?? [],
    reports: partial.reports ?? [],
    ...partial,
  }
}

export function sampleSnapshot(): IntelSnapshot {
  return {
    subjects: [
      makeSubject({
        kind: 'self',
        username: 'me_user',
        posts: [
          makePost({ id: 'p1', text: 'staking VVV on Base', createdAt: '2026-07-08T10:00:00.000Z', metrics: { impressions: 0, likes: 50, reposts: 5, replies: 2, quotes: 0, bookmarks: 1 } }),
          makePost({ id: 'p-old', text: 'old news about cats', createdAt: '2026-01-01T10:00:00.000Z' }),
        ],
        bookmarks: [makePost({ id: 'b1', text: 'bookmarked privacy post', createdAt: '2026-07-07T10:00:00.000Z' })],
        reports: [makeReport('r-me', 'Self is focused on privacy and staking.')],
      }),
      makeSubject({
        kind: 'target',
        username: 'AskVenice',
        posts: [
          makePost({ id: 't1', text: 'Venice privacy AI', createdAt: '2026-07-08T11:00:00.000Z', metrics: { impressions: 0, likes: 200, reposts: 20, replies: 5, quotes: 1, bookmarks: 3 } }),
          makePost({ id: 't2', text: 'DIEM minting guide', createdAt: '2026-07-02T11:00:00.000Z' }),
        ],
        reports: [makeReport('r-av', 'AskVenice evangelizes private inference.')],
        edges: [{ source: 'id-AskVenice', target: 'x', targetUsername: 'gekko_eth', kind: 'mention', weight: 3, lastSeen: '2026-07-08T00:00:00.000Z' } satisfies Edge],
      }),
    ],
  }
}
```

Adjust `makeProfile` fields to match the real `Profile` interface in `src/lib/x-intel/types.ts` (read that file and align — do not invent fields).

- [ ] **Step 2: Implement `format.ts` helpers**

```typescript
// src/lib/intel-library/format.ts
import type { Edge, IntelReportSnapshot, Post, Profile } from '../x-intel/types'

export function formatProfileLine(p: Profile): string {
  const v = p.verified?.type ? ` · ${p.verified.type}✓` : ''
  return `@${p.username} (${p.displayName})${v} · ${p.metrics.followers} followers` +
    (p.bio ? `\n  Bio: ${p.bio.replace(/\s+/g, ' ').trim()}` : '')
}

export function formatPostLine(p: Post): string {
  const date = p.createdAt.slice(0, 10)
  const text = p.text.replace(/\s+/g, ' ').trim()
  return `  - [${date}] id=${p.id} (${p.kind}) ♥${p.metrics.likes} — ${text}`
}

export function formatReportBrief(s: IntelReportSnapshot): string {
  const sum = s.narrative?.executiveSummary ?? ''
  const strat = s.narrative?.strategicAssessment ?? ''
  return `Report ${s.id} (${s.createdAt.slice(0, 10)}):\n  Summary: ${sum}\n  Assessment: ${strat.slice(0, 500)}`
}

export function formatEdgeLine(e: Edge): string {
  return `  - ${e.kind} @${e.targetUsername} ×${e.weight}`
}
```

- [ ] **Step 3: Implement pure `library.ts` with list/get/counts + scope filter**

```typescript
// src/lib/intel-library/library.ts
import type {
  ComposeScope,
  GrepHit,
  IntelSnapshot,
  LibraryCounts,
  LibrarySubject,
} from './types'
import { formatPostLine, formatProfileLine, formatReportBrief } from './format'

export function subjectsInScope(snap: IntelSnapshot, scope: ComposeScope): LibrarySubject[] {
  if (scope.type === 'all') return snap.subjects
  if (scope.type === 'me') return snap.subjects.filter((s) => s.kind === 'self')
  const u = scope.username.replace(/^@/, '').toLowerCase()
  return snap.subjects.filter((s) => s.kind === 'target' && s.username.toLowerCase() === u)
}

export function listSubjects(snap: IntelSnapshot, scope: ComposeScope) {
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
  const subs = subjectsInScope(snap, scope)
  return {
    subjects: subs.length,
    posts: subs.reduce((n, s) => n + s.posts.length, 0),
    reports: subs.reduce((n, s) => n + s.reports.length, 0),
    bookmarks: subs.reduce((n, s) => n + s.bookmarks.length, 0),
    likes: subs.reduce((n, s) => n + s.likes.length, 0),
  }
}

export function getSubject(snap: IntelSnapshot, scope: ComposeScope, handle: string): LibrarySubject | null {
  const u = handle.replace(/^@/, '').toLowerCase()
  return subjectsInScope(snap, scope).find((s) => s.username.toLowerCase() === u) ?? null
}

// grep, glob, getPosts, getReport, getEdges — implement in Task 3
```

- [ ] **Step 4: Tests for scope + counts**

```typescript
// src/lib/intel-library/library.test.ts
import { describe, it, expect } from 'vitest'
import { listSubjects, libraryCounts, subjectsInScope } from './library'
import { sampleSnapshot } from './test-fixtures'

describe('scope', () => {
  const snap = sampleSnapshot()
  it('me only self', () => {
    expect(subjectsInScope(snap, { type: 'me' }).map((s) => s.username)).toEqual(['me_user'])
  })
  it('target only that handle', () => {
    expect(subjectsInScope(snap, { type: 'target', username: 'AskVenice' })).toHaveLength(1)
  })
  it('all both', () => {
    expect(listSubjects(snap, { type: 'all' })).toHaveLength(2)
  })
  it('counts posts in all', () => {
    expect(libraryCounts(snap, { type: 'all' }).posts).toBe(4)
  })
})
```

- [ ] **Step 5: Run tests PASS + commit**

```bash
npm test -- src/lib/intel-library/library.test.ts
git add src/lib/intel-library
git commit -m "feat(intel-library): add types, fixtures, scope and counts"
```

---

### Task 3: Grep, glob, and get* on IntelLibrary

**Files:**
- Modify: `src/lib/intel-library/library.ts`
- Modify: `src/lib/intel-library/library.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { grepIntel, globIntel, getPosts, getReport, getEdges, getProfile } from './library'

describe('grepIntel', () => {
  const snap = sampleSnapshot()
  it('finds posts by all terms', () => {
    const hits = grepIntel(snap, { type: 'all' }, { query: 'staking VVV', types: ['posts'], limit: 20 })
    expect(hits.some((h) => h.id === 'p1')).toBe(true)
  })
  it('finds report narrative', () => {
    const hits = grepIntel(snap, { type: 'all' }, { query: 'private inference', types: ['reports'] })
    expect(hits.some((h) => h.type === 'report')).toBe(true)
  })
  it('respects handle filter', () => {
    const hits = grepIntel(snap, { type: 'all' }, { query: 'privacy', handle: 'me_user' })
    expect(hits.every((h) => h.handle === 'me_user')).toBe(true)
  })
})

describe('globIntel', () => {
  it('lists report paths', () => {
    const paths = globIntel(snap, { type: 'all' }, 'intel/**/reports')
    expect(paths.some((p) => p.includes('AskVenice'))).toBe(true)
  })
})

describe('getters', () => {
  it('getPosts respects since and limit', () => {
    const posts = getPosts(snap, { type: 'all' }, {
      handle: 'AskVenice',
      source: 'posts',
      since: '2026-07-05',
      limit: 10,
    })
    expect(posts.map((p) => p.id)).toEqual(['t1'])
  })
  it('getReport defaults to latest', () => {
    const r = getReport(snap, { type: 'target', username: 'AskVenice' }, { handle: 'AskVenice' })
    expect(r?.id).toBe('r-av')
  })
})
```

- [ ] **Step 2: Implement**

Implementation notes:

- `grepIntel`: split query on whitespace; all terms must appear case-insensitive in haystack. Haystacks: post text, report executiveSummary+strategicAssessment+themes, profile bio, edge usernames. Cap limit 50. Snippet ~200 chars around first match.
- `globIntel`: support `*` and `**` with a small matcher (convert glob to regex). Enumerate concrete paths from subjects in scope. Return `{ path, meta }[]`.
- `getPosts`: filter by handle, source (`posts`|`bookmarks`|`likes`), since/until (ISO date prefix compare), kind, ids; sort newest first; max 40.
- `getReport`: by id or first in array (newest first).
- `getEdges`: sort by weight desc, limit.
- `getProfile`: return profile or null.

- [ ] **Step 3: Tests PASS + commit**

```bash
npm test -- src/lib/intel-library/library.test.ts
git add src/lib/intel-library
git commit -m "feat(intel-library): grep, glob, and getters"
```

---

### Task 4: Snapshot adapter from Zustand stores

**Files:**
- Create: `src/lib/intel-library/from-stores.ts`
- Create: `src/lib/intel-library/from-stores.test.ts` (optional pure unit with plain objects)
- Create: `src/lib/intel-library/scope.ts` — map compose context string → `ComposeScope`

- [ ] **Step 1: Implement scope mapper**

```typescript
// src/lib/intel-library/scope.ts
import { ME_CONTEXT, ALL_CONTEXT } from '../../stores/compose-store'
import type { ComposeScope } from './types'

export function scopeFromContext(activeContext: string): ComposeScope {
  if (activeContext === ME_CONTEXT) return { type: 'me' }
  if (activeContext === ALL_CONTEXT) return { type: 'all' }
  return { type: 'target', username: activeContext }
}
```

- [ ] **Step 2: Implement `buildIntelSnapshot`**

```typescript
// src/lib/intel-library/from-stores.ts
import type { SelfAccount } from '../../stores/x-self-store'
import type { IntelReport } from '../../stores/x-intel-store'
import type { IntelSnapshot, LibrarySubject } from './types'

export function buildIntelSnapshot(input: {
  selfAccounts: SelfAccount[]
  reports: IntelReport[]
}): IntelSnapshot {
  const subjects: LibrarySubject[] = []

  for (const acc of input.selfAccounts) {
    if (!acc.profile && acc.posts.length === 0 && acc.bookmarks.length === 0) continue
    subjects.push({
      kind: 'self',
      id: acc.id,
      username: acc.username,
      profile: acc.profile,
      posts: acc.posts,
      bookmarks: acc.bookmarks,
      likes: acc.likes,
      edges: acc.edges,
      reports: acc.reportHistory ?? [],
      refreshedAt: acc.refreshedAt?.posts ?? acc.refreshedAt?.profile,
    })
  }

  for (const r of input.reports) {
    if (!r.profile && r.posts.length === 0) continue
    subjects.push({
      kind: 'target',
      id: r.profile?.id ?? r.username,
      username: r.username,
      profile: r.profile,
      posts: r.posts,
      bookmarks: [],
      likes: [],
      edges: r.edges ?? [],
      reports: r.reportHistory ?? [],
      refreshedAt: r.refreshedAt,
    })
  }

  return { subjects }
}
```

Verify `IntelReport` field names (`refreshedAt`, `edges`, `reportHistory`) against `x-intel-store.ts` and fix if needed.

- [ ] **Step 3: Unit test with plain SelfAccount/IntelReport-shaped objects**

- [ ] **Step 4: Commit**

```bash
git add src/lib/intel-library
git commit -m "feat(intel-library): build snapshot from self and target stores"
```

---

### Task 5: Hot window packer

**Files:**
- Create: `src/lib/compose/hot-window.ts`
- Create: `src/lib/compose/hot-window.test.ts`

- [ ] **Step 1: Write failing tests using `sampleSnapshot`**

```typescript
import { describe, it, expect } from 'vitest'
import { packHotWindow } from './hot-window'
import { sampleSnapshot } from '../intel-library/test-fixtures'
import { estimateTokens } from './token-estimate'

const now = new Date('2026-07-09T12:00:00.000Z')

describe('packHotWindow', () => {
  const snap = sampleSnapshot()

  it('Auto stays under budget', () => {
    const result = packHotWindow({
      snapshot: snap,
      scope: { type: 'all' },
      mode: 'auto',
      dayWindowDays: 7,
      tokenBudget: 500,
      now,
    })
    expect(result.overBudget).toBe(false)
    expect(estimateTokens(result.text)).toBeLessThanOrEqual(500)
    expect(result.text).toContain('LOCAL INTEL')
  })

  it('prefers bookmarks and recent staking post over old cats post when budget tight', () => {
    const result = packHotWindow({
      snapshot: snap,
      scope: { type: 'me' },
      mode: 'auto',
      dayWindowDays: 7,
      tokenBudget: 200,
      now,
    })
    expect(result.text).toMatch(/bookmarked|staking/i)
    // old post may be omitted under tight budget
  })

  it('Custom overBudget when day window cannot fit', () => {
    const result = packHotWindow({
      snapshot: snap,
      scope: { type: 'all' },
      mode: 'custom',
      dayWindowDays: 30,
      tokenBudget: 50, // impossibly small
      now,
    })
    expect(result.overBudget).toBe(true)
    expect(result.estimatedTokens).toBeGreaterThan(50)
  })

  it('includes latest report summary when budget allows', () => {
    const result = packHotWindow({
      snapshot: snap,
      scope: { type: 'target', username: 'AskVenice' },
      mode: 'auto',
      dayWindowDays: 7,
      tokenBudget: 5000,
      now,
    })
    expect(result.text).toMatch(/private inference|AskVenice/i)
  })
})
```

- [ ] **Step 2: Implement packer**

```typescript
// src/lib/compose/hot-window.ts — structure
export type LibraryMode = 'auto' | 'custom'

export interface PackInput {
  snapshot: IntelSnapshot
  scope: ComposeScope
  mode: LibraryMode
  dayWindowDays: number | null // null = all time preference
  tokenBudget: number
  now?: Date
}

export interface PackResult {
  text: string
  estimatedTokens: number
  overBudget: boolean
  included: { posts: number; reports: number; subjects: number }
}

/**
 * Ranking for candidate blocks (highest first):
 * 1. bookmarks (self)
 * 2. latest report per subject
 * 3. profile line
 * 4. posts in day window (newest, soft likes tie-break)
 * 5. auto-only: older posts + older reports
 * 6. top edges (max 5 per subject) if room
 *
 * Auto: add blocks while estimateTokens(joined) <= budget; drop lowest priority.
 * Custom: build required set (window posts + profile + latest report + bookmarks);
 *   if over budget, overBudget=true and still return full required text for the meter.
 */
```

Use `subjectsInScope`, format helpers, `estimateTokens`. Header:

```
===== LOCAL INTEL (scope: All | @AskVenice | Me) =====
...
===== END · use tools for anything not above =====
```

- [ ] **Step 3: PASS + commit**

```bash
npm test -- src/lib/compose/hot-window.test.ts
git add src/lib/compose/hot-window.ts src/lib/compose/hot-window.test.ts
git commit -m "feat(compose): hot window packer with Auto and Custom modes"
```

---

### Task 6: Compose store library settings

**Files:**
- Modify: `src/stores/compose-store.ts`
- Create: `src/stores/compose-store.library.test.ts` (optional; or manual check)

- [ ] **Step 1: Extend state**

Add:

```typescript
export type LibraryMode = 'auto' | 'custom'

// on ComposeState:
libraryMode: LibraryMode
budgetPct: number
dayWindowDays: number | null // null = all time
toolActivity: string | null // ephemeral, not persisted

setLibraryMode: (mode: LibraryMode) => void
setBudgetPct: (pct: number) => void
setDayWindowDays: (days: number | null) => void
setToolActivity: (label: string | null) => void
```

Defaults: `libraryMode: 'auto'`, `budgetPct: 0.5`, `dayWindowDays: 7`, `toolActivity: null`.

- [ ] **Step 2: Persist + migrate**

- Bump persist `version` to `3`
- In `migrate`, if `version < 3`, set defaults for new fields
- `partialize` include `libraryMode`, `budgetPct`, `dayWindowDays` (not `toolActivity`, not `isStreaming`)

- [ ] **Step 3: Commit**

```bash
git add src/stores/compose-store.ts
git commit -m "feat(compose): persist library mode, budget, and day window"
```

---

### Task 7: Venice types for tool calling

**Files:**
- Modify: `src/types/venice.ts`

- [ ] **Step 1: Extend types** (match playground shapes)

```typescript
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[] | null
  reasoning_content?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  venice_parameters?: VeniceParameters
}

// ChatCompletionResponse.choices[].message:
message: {
  role: string
  content: string | null
  tool_calls?: ToolCall[]
}
```

- [ ] **Step 2: Fix any TS fallout** (`npm run build` or `tsc -b`). `ChatMessage` content null may need narrow checks in compose UI (already checks string).

- [ ] **Step 3: Commit**

```bash
git add src/types/venice.ts
git commit -m "feat(venice): types for chat tool calling"
```

---

### Task 8: Intel tool schemas + executor

**Files:**
- Create: `src/lib/compose/intel-tools.ts`
- Create: `src/lib/compose/intel-tools.test.ts`

- [ ] **Step 1: Define `COMPOSE_INTEL_TOOLS: ToolDefinition[]`**

Tools (names exact):

- `intel_list_subjects`
- `intel_glob` — params: `pattern`
- `intel_grep` — params: `query`, `types?`, `handle?`, `since?`, `until?`, `limit?`
- `intel_get_profile` — `handle`
- `intel_get_posts` — `handle`, `source?`, `since?`, `until?`, `limit?`, `ids?`
- `intel_get_report` — `handle`, `reportId?`
- `intel_get_edges` — `handle`, `limit?`

- [ ] **Step 2: Implement executor**

```typescript
export function executeIntelTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { snapshot: IntelSnapshot; scope: ComposeScope },
): unknown {
  try {
    switch (name) {
      case 'intel_list_subjects':
        return listSubjects(ctx.snapshot, ctx.scope)
      case 'intel_glob':
        return globIntel(ctx.snapshot, ctx.scope, String(args.pattern ?? 'intel/**'))
      // ...
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'tool failed' }
  }
}
```

Cap JSON size: if `JSON.stringify(result).length > 32_000`, truncate arrays and add `truncated: true`.

- [ ] **Step 3: Unit tests with sampleSnapshot**

- [ ] **Step 4: Commit**

```bash
git add src/lib/compose/intel-tools.ts src/lib/compose/intel-tools.test.ts
git commit -m "feat(compose): intel library tool schemas and executor"
```

---

### Task 9: Compose prompt rewrite (static system + hot block)

**Files:**
- Modify: `src/lib/compose/compose-prompt.ts`
- Create: `src/lib/compose/compose-prompt.test.ts` (if none)

- [ ] **Step 1: Replace corpus/target dump in system with tool-aware static system**

```typescript
export interface ComposeSystemOpts {
  xSearchOn: boolean
  toolsEnabled: boolean
}

export function buildComposeSystem(opts: ComposeSystemOpts): string {
  // ghostwriter + postdraft BLOCK_SPEC
  // if xSearchOn: live X search blurb
  // if toolsEnabled: rules prefer hot window; use intel_* tools; never invent ids
  // NO corpus dump here
}

export function buildHotUserPrefix(hotText: string, userMessage: string): string {
  if (!hotText.trim()) return userMessage
  return `${hotText}\n\n---\n${userMessage}`
}
```

Remove or stop using `TargetContext` / `corpus` in system prompt. Callers will pass hot text into the user message instead.

- [ ] **Step 2: Update any imports that break**

- [ ] **Step 3: Commit**

```bash
git add src/lib/compose/compose-prompt.ts src/lib/compose/compose-prompt.test.ts
git commit -m "refactor(compose): static system prompt; hot window on user turn"
```

---

### Task 10: Compose agent loop

**Files:**
- Create: `src/lib/compose/compose-agent.ts`
- Create: `src/lib/compose/compose-agent.test.ts`

- [ ] **Step 1: Implement non-streaming tool loop**

```typescript
// src/lib/compose/compose-agent.ts
import { venice } from '../venice-client'
import type { ChatMessage, ToolDefinition, ChatCompletionResponse } from '../../types/venice'
import { COMPOSE_INTEL_TOOLS, executeIntelTool } from './intel-tools'
import type { ComposeScope, IntelSnapshot } from '../intel-library/types'

export const MAX_TOOL_ROUNDS = 6

export interface ComposeAgentOpts {
  model: string
  system: string
  /** Full user message including hot prefix + user text (and prior transcript without system). */
  messages: ChatMessage[] // should already include system as first if desired
  snapshot: IntelSnapshot
  scope: ComposeScope
  xSearchOn: boolean
  signal?: AbortSignal
  onTool?: (info: { name: string; args: Record<string, unknown> }) => void
}

export async function runComposeAgent(opts: ComposeAgentOpts): Promise<{ content: string; toolCalls: number }> {
  const messages: ChatMessage[] = [...opts.messages]
  let toolCalls = 0

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const resp = await venice<ChatCompletionResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: 0.6,
        max_tokens: 4096,
        tools: COMPOSE_INTEL_TOOLS,
        tool_choice: 'auto',
        venice_parameters: { enable_x_search: opts.xSearchOn },
      }),
      signal: opts.signal,
    })

    const message = resp.choices[0]?.message
    if (!message) return { content: '', toolCalls }

    const calls = message.tool_calls ?? []
    messages.push({
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: calls.length ? calls : undefined,
    })

    if (calls.length === 0) {
      return { content: (message.content ?? '').trim(), toolCalls }
    }

    for (const call of calls) {
      const name = call.function?.name ?? ''
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function?.arguments || '{}') as Record<string, unknown>
      } catch {
        args = {}
      }
      opts.onTool?.({ name, args })
      const result = executeIntelTool(name, args, { snapshot: opts.snapshot, scope: opts.scope })
      toolCalls++
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  return {
    content: `Stopped after ${MAX_TOOL_ROUNDS} library tool rounds. Try a more specific question.`,
    toolCalls,
  }
}
```

- [ ] **Step 2: Unit test with mocked `venice`**

Mock module `../venice-client` to return first a tool_call for `intel_grep`, then a final text with a fake postdraft. Assert two HTTP-shaped calls and final content.

- [ ] **Step 3: Commit**

```bash
git add src/lib/compose/compose-agent.ts src/lib/compose/compose-agent.test.ts
git commit -m "feat(compose): multi-round intel tool agent loop"
```

---

### Task 11: Wire `useCompose` + Custom block

**Files:**
- Modify: `src/hooks/use-compose.ts`
- Modify: `src/components/compose/compose-chat.tsx`
- Modify: `src/components/compose/compose-workspace.tsx`

- [ ] **Step 1: Change `send` signature**

```typescript
// send no longer takes TargetContext / corpus dump
async function send(userMessage: string): Promise<void>
```

Inside `send`:

1. Read stores: `useXIntelStore.getState()`, `useXSelfStore.getState()`, compose library settings, model list for context limit (pass `contextLimit` in or resolve via `useModels` cache — simplest: accept optional `contextLimit` from workspace, or import models store if any; else resolve from `useComposeStore` + parameter).

Practical approach: workspace computes:

```typescript
const snapshot = useMemo(() => buildIntelSnapshot({...}), [...])
const scope = scopeFromContext(activeContext)
const modelObj = models?.find(m => m.id === model)
const contextLimit = resolveContextLimit(modelObj)
const budget = computeHotBudget(contextLimit, budgetPct)
const pack = packHotWindow({ snapshot, scope, mode: libraryMode, dayWindowDays, tokenBudget: budget })
```

Pass `pack` + `snapshot` + `scope` + `overBudget` into chat, or have `send` rebuild from getState() so it is always fresh:

```typescript
// inside useCompose.send:
const self = Object.values(useXSelfStore.getState().accounts)
const reports = Object.values(useXIntelStore.getState().reports)
const snapshot = buildIntelSnapshot({ selfAccounts: self, reports })
const scope = scopeFromContext(activeContext)
const { libraryMode, budgetPct, dayWindowDays, model, xSearch } = useComposeStore.getState()
// contextLimit: read from a small module-level setter set by workspace, OR add contextLimit to compose store updated when model changes
```

**Recommended:** store `contextLimit` on compose store updated by workspace when models load (`setContextLimit`). Default `DEFAULT_CONTEXT_FALLBACK`.

2. Pack hot window  
3. If `libraryMode === 'custom' && pack.overBudget` → set assistant error message, do not call Venice  
4. Else `runComposeAgent` with system + history where **latest user message** is `buildHotUserPrefix(pack.text, userMessage)`  
5. Note: history in store should keep the **raw** user message (without huge hot block) for UI readability; only the API messages array gets the hot prefix. Implementation:

```typescript
addMessage(context, { role: 'user', content: userMessage }) // UI
// API:
const apiHistory = session.messages.map(...) // prior turns WITHOUT re-injecting old hot blocks
// For prior user messages, send as stored (raw). Only the latest user API message gets hot prefix.
const apiMessages: ChatMessage[] = [
  { role: 'system', content: system },
  ...priorRawMessages,
  { role: 'user', content: buildHotUserPrefix(pack.text, userMessage) },
]
```

6. On success: `setLastAssistantContent`, parse postdraft as today  
7. `setToolActivity` during tools; clear in `finally`  
8. Stage 1: **non-streaming** final content (set full string). UI shows tool activity then full reply. (Streaming can return later.)

- [ ] **Step 2: Update ComposeChat**

- Remove `targetContext` / `corpus` props  
- Empty state: mention local library + tools  
- Disable send when parent says `sendBlocked`  
- Show `toolActivity` under input when set  

- [ ] **Step 3: Smoke-test manually in dev** (gather optional; empty corpus must still work)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-compose.ts src/components/compose/compose-chat.tsx src/components/compose/compose-workspace.tsx src/stores/compose-store.ts
git commit -m "feat(compose): wire hot window and intel agent into send path"
```

---

### Task 12: Library meter UI

**Files:**
- Create: `src/components/compose/library-meter.tsx`
- Modify: `src/components/compose/compose-workspace.tsx`

- [ ] **Step 1: Build meter component**

Props: `pack: PackResult`, `budget: number`, `contextLimit: number`, `budgetPct`, `counts: LibraryCounts`, `libraryMode`, `dayWindowDays`, setters, `limitAssumed: boolean`.

Render:

- Mode toggle Auto | Custom  
- Budget select: 25% / 50% / 75%  
- Days select: 1 / 3 / 7 / 14 / 30 / All  
- Line: `Hot ~X · Budget Y (P% of L) · Headroom Z · Library N posts · R reports`  
- If Custom && overBudget: amber banner with actions  

Use existing control styles from compose-workspace (same select/button classes).

- [ ] **Step 2: Mount in workspace control row**

- [ ] **Step 3: Domain chips** optional text: `X · News soon · Signal soon · Stats soon` in muted style

- [ ] **Step 4: Commit**

```bash
git add src/components/compose/library-meter.tsx src/components/compose/compose-workspace.tsx
git commit -m "feat(compose): library token meter and Auto/Custom controls"
```

---

### Task 13: Retire flat dump + cleanup

**Files:**
- Modify or delete: `src/lib/compose/build-corpus.ts`
- Grep for `buildCorpus` / `TargetContext` usages and remove

- [ ] **Step 1: Remove all `buildCorpus` call sites**

- [ ] **Step 2: Either delete `build-corpus.ts` or leave a comment re-exporting nothing — prefer **delete** if unused

- [ ] **Step 3: Full test suite + typecheck**

```bash
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(compose): remove flat corpus dump in favor of dual access"
```

---

### Task 14: Acceptance checklist (manual)

- [ ] Empty corpus: compose still works; meter shows 0  
- [ ] Gather a target + generate a report: Auto hot text includes report summary  
- [ ] Ask about a post older than 7 days: agent uses `intel_grep` / `intel_get_posts` (watch tool activity)  
- [ ] Custom + tiny budget + long day window: send blocked with banner  
- [ ] Switch Me / @target / All: meter counts and pack scope change  
- [ ] Change model with different `availableContextTokens`: budget number changes  
- [ ] Reply draft uses real post id from library when user asks to reply  
- [ ] X search toggle still works alongside tools  
- [ ] Encrypted stores unchanged (no new server persistence)

- [ ] **Final commit** if any polish:

```bash
git commit -m "chore(compose): Stage 1 dual-access acceptance polish"
```

---

## Spec coverage (self-review)

| Spec requirement | Task(s) |
|------------------|---------|
| IntelLibrary read API | 2, 3, 4 |
| Hot packer Auto/Custom | 5 |
| Token estimate ~50% + reserved | 1, 5, 12 |
| Grep + glob tools | 3, 8 |
| Tool loop max 6 | 10 |
| Static system / hot on user turn | 9, 11 |
| Me / @target / All scope | 2, 4, 11 |
| UI meter + settings persist | 6, 12 |
| Retire flat dump | 13 |
| No storage redesign | all (from-stores only) |
| No News/Signal/Stats Stage 1 | domain chips disabled only |
| Stage 1.5 gates | documented in spec only (no code) |

## Placeholder scan

No TBD steps; concrete files and test commands included. Adjust `Profile` fixture fields to match live `types.ts` when implementing Task 2.

## Type consistency

- `LibraryMode` defined in packer and re-exported or duplicated once in compose-store (prefer single export from `hot-window.ts` imported by store)  
- Tool names: `intel_*` only  
- `ComposeScope` from `intel-library/types.ts` used everywhere  

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-09-compose-intel-library.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
