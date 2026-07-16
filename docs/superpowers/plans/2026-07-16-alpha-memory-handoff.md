# Alpha Memory + Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Alpha a rolling 24h cold archive (briefs, news snapshots, hydrates) with pins, cluster hydrate, per-rail Grok briefs, Compose hot-slice + `alpha_*` tools, and thin Open-in-Composer handoff.

**Architecture:** Extend `alpha-store` (encrypted IndexedDB) with a cold archive + prune/pin. Pure helpers in `src/lib/alpha/` for archive ops, hydrate fetch, and hot packing. Compose reads the same store via `alpha-tools.ts` and an `alpha-hot.ts` merge (parallel to `news-hot.ts`). Handoff seeds Compose threads via a small `open-compose` helper — no auto-draft.

**Tech Stack:** TypeScript, Zustand persist + encrypted IndexedDB, Vitest, existing `x-alpha-client` / `grok-brief` / `compose-agent` tool loop.

**Spec:** `docs/superpowers/specs/2026-07-16-alpha-memory-handoff-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/lib/alpha/types.ts` | Cold archive record types + pin flag |
| `src/lib/alpha/archive.ts` | Insert, dedupe, prune (24h), pin/unpin, list/grep/get |
| `src/lib/alpha/archive.test.ts` | Prune, pin, dedupe, grep |
| `src/lib/alpha/default-rails.ts` | Add `ALPHA_COLD_TTL_MS = 24h` |
| `src/stores/alpha-store.ts` | Persist cold archive; wrap archive helpers; bump version |
| `src/stores/alpha-store.test.ts` | Store pin/prune/keep |
| `src/lib/alpha/x-alpha-client.ts` | `fetchPostsByIds` |
| `src/lib/alpha/grok-brief.ts` | Already supports single-rail via `rails` arg — reuse |
| `src/lib/compose/alpha-hot.ts` | Format + merge Alpha hot slice |
| `src/lib/compose/alpha-hot.test.ts` | Packing / budget trim |
| `src/lib/compose/alpha-tools.ts` | `COMPOSE_ALPHA_TOOLS` + `executeAlphaTool` |
| `src/lib/compose/alpha-tools.test.ts` | list/grep/get against store snapshot |
| `src/lib/compose/compose-agent.ts` | Register + dispatch `alpha_*` |
| `src/lib/compose/compose-prompt.ts` | Alpha tools + 24h memory blurb |
| `src/hooks/use-compose.ts` | Merge Alpha hot after news bookmarks |
| `src/lib/compose/open-alpha-compose.ts` | Seed thread from brief/story/rail |
| `src/components/compose/alpha/alpha-view.tsx` | Hydrate, per-rail brief, pin, handoff UI |

---

### Task 1: Cold archive types + pure prune/pin/dedupe

**Files:**
- Modify: `src/lib/alpha/types.ts`
- Modify: `src/lib/alpha/default-rails.ts`
- Create: `src/lib/alpha/archive.ts`
- Create: `src/lib/alpha/archive.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/alpha/archive.test.ts
import { describe, expect, it } from 'vitest'
import {
  pruneAlphaArchive,
  upsertBrief,
  upsertStory,
  upsertPosts,
  setPinned,
  grepArchive,
  listArchive,
  type AlphaArchiveState,
} from './archive'
import { ALPHA_COLD_TTL_MS } from './default-rails'

function empty(): AlphaArchiveState {
  return { briefs: {}, stories: {}, posts: {} }
}

describe('pruneAlphaArchive', () => {
  it('drops unpinned items older than 24h and keeps pins', () => {
    const now = 1_000_000_000_000
    const state: AlphaArchiveState = {
      briefs: {
        old: {
          id: 'old',
          kind: 'global',
          markdown: 'x',
          model: 'grok',
          fetchedAt: now - ALPHA_COLD_TTL_MS - 1,
          pinned: false,
        },
        pinned: {
          id: 'pinned',
          kind: 'global',
          markdown: 'y',
          model: 'grok',
          fetchedAt: now - ALPHA_COLD_TTL_MS - 1,
          pinned: true,
        },
      },
      stories: {},
      posts: {},
    }
    const next = pruneAlphaArchive(state, now)
    expect(next.briefs.old).toBeUndefined()
    expect(next.briefs.pinned).toBeTruthy()
  })
})

describe('upsertPosts', () => {
  it('dedupes by post id (newer fetchedAt wins)', () => {
    let s = empty()
    s = upsertPosts(s, [
      {
        id: 'p1',
        text: 'a',
        url: 'https://x.com/i/status/p1',
        fetchedAt: 1,
        pinned: false,
        storyId: 's1',
      },
    ])
    s = upsertPosts(s, [
      {
        id: 'p1',
        text: 'b',
        url: 'https://x.com/i/status/p1',
        fetchedAt: 2,
        pinned: false,
        storyId: 's1',
      },
    ])
    expect(s.posts.p1?.text).toBe('b')
    expect(Object.keys(s.posts)).toHaveLength(1)
  })
})

describe('grepArchive', () => {
  it('finds substring in brief markdown', () => {
    let s = empty()
    s = upsertBrief(s, {
      id: 'b1',
      kind: 'rail',
      railId: 'sys-sphere',
      railLabel: 'Venice',
      query: 'q',
      markdown: 'Accelerating: uncensored models',
      model: 'grok',
      fetchedAt: Date.now(),
      pinned: false,
    })
    const hits = grepArchive(s, 'uncensored')
    expect(hits.some((h) => h.kind === 'brief' && h.id === 'b1')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/alpha/archive.test.ts --reporter=dot`  
Expected: FAIL (module / exports missing)

- [ ] **Step 3: Implement types + archive helpers**

Add to `src/lib/alpha/default-rails.ts`:

```typescript
/** Cold archive retention for unpinned items (product: trending window). */
export const ALPHA_COLD_TTL_MS = 24 * 60 * 60 * 1000
```

Extend `src/lib/alpha/types.ts`:

```typescript
export type AlphaBriefKind = 'global' | 'rail'

export interface AlphaColdBrief {
  id: string
  kind: AlphaBriefKind
  railId?: string
  railLabel?: string
  query?: string
  markdown: string
  model: string
  fetchedAt: number
  pinned: boolean
}

export interface AlphaColdStory {
  id: string
  name: string
  hook?: string
  summary?: string
  category?: string
  clusterPostIds: string[]
  url?: string
  fetchedAt: number
  pinned: boolean
}

/** Hydrated post kept in cold archive (AlphaPostCard + archive meta). */
export interface AlphaColdPost extends AlphaPostCard {
  fetchedAt: number
  pinned: boolean
  storyId?: string
  railId?: string
}
```

Create `src/lib/alpha/archive.ts` with:

```typescript
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
```

Brief ids: `brief-global-${fetchedAt}` or `brief-rail-${railId}-${fetchedAt}` assigned by callers.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `npx vitest run src/lib/alpha/archive.test.ts --reporter=dot`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/alpha/types.ts src/lib/alpha/default-rails.ts src/lib/alpha/archive.ts src/lib/alpha/archive.test.ts
git commit -m "$(cat <<'EOF'
feat(alpha): cold archive helpers with 24h prune and pins

EOF
)"
```

---

### Task 2: Wire cold archive into `alpha-store`

**Files:**
- Modify: `src/stores/alpha-store.ts`
- Modify: `src/stores/alpha-store.test.ts`

- [ ] **Step 1: Write failing store tests**

```typescript
// append to src/stores/alpha-store.test.ts
it('keeps briefs and prunes unpinned after 24h', () => {
  const now = Date.now()
  useAlphaStore.getState().keepBrief({
    id: 'b-old',
    kind: 'global',
    markdown: 'old',
    model: 'm',
    fetchedAt: now - 25 * 60 * 60 * 1000,
    pinned: false,
  })
  useAlphaStore.getState().keepBrief({
    id: 'b-pin',
    kind: 'global',
    markdown: 'pin',
    model: 'm',
    fetchedAt: now - 25 * 60 * 60 * 1000,
    pinned: true,
  })
  useAlphaStore.getState().pruneCold()
  const { briefs } = useAlphaStore.getState()
  expect(briefs['b-old']).toBeUndefined()
  expect(briefs['b-pin']).toBeTruthy()
})

it('toggles pin on a story', () => {
  useAlphaStore.getState().keepStory({
    id: 's1',
    name: 'Story',
    clusterPostIds: [],
    fetchedAt: Date.now(),
    pinned: false,
  })
  useAlphaStore.getState().setColdPinned('story', 's1', true)
  expect(useAlphaStore.getState().stories['s1']?.pinned).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/alpha-store.test.ts --reporter=dot`  
Expected: FAIL (methods missing)

- [ ] **Step 3: Extend store**

Add to state (persisted):

```typescript
briefs: Record<string, AlphaColdBrief>
stories: Record<string, AlphaColdStory>
posts: Record<string, AlphaColdPost>
```

Actions: `keepBrief`, `keepStory`, `keepPosts`, `setColdPinned`, `pruneCold` — each runs through `archive.ts` helpers then `set`. Call `pruneCold()` at start of keep* and expose for Alpha open.

`partialize`: include `briefs`, `stories`, `posts` (plus existing rails/counts/lifetimeCost).

Bump persist `version` to `3`. In `migrate`, ensure `briefs/stories/posts` default to `{}`, then `pruneAlphaArchive`.

- [ ] **Step 4: Run tests — PASS**

Run: `npx vitest run src/stores/alpha-store.test.ts --reporter=dot`

- [ ] **Step 5: Commit**

```bash
git add src/stores/alpha-store.ts src/stores/alpha-store.test.ts
git commit -m "$(cat <<'EOF'
feat(alpha): persist 24h cold archive on alpha-store

EOF
)"
```

---

### Task 3: `fetchPostsByIds` for cluster hydrate

**Files:**
- Modify: `src/lib/alpha/x-alpha-client.ts`
- Create: `src/lib/alpha/x-alpha-client.test.ts` (mock `fetch`)

- [ ] **Step 1: Write failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPostsByIds } from './x-alpha-client'

describe('fetchPostsByIds', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: '1',
                text: 'hello',
                author_id: 'u1',
                public_metrics: { like_count: 3 },
              },
            ],
            includes: { users: [{ id: 'u1', username: 'alice' }] },
          }),
          { status: 200 },
        ),
      ),
    )
  })

  it('returns AlphaPostCards and costs by post count', async () => {
    const { posts, cost } = await fetchPostsByIds(['1'])
    expect(posts[0]?.authorUsername).toBe('alice')
    expect(posts[0]?.text).toBe('hello')
    expect(cost).toBeGreaterThan(0)
  })

  it('no-ops on empty ids', async () => {
    const res = await fetchPostsByIds([])
    expect(res.posts).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
/** Max ids per X tweets lookup (API allows 100; we keep clusters smaller). */
export const ALPHA_HYDRATE_MAX_IDS = 25

export async function fetchPostsByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<{ posts: AlphaPostCard[]; cost: number }> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, ALPHA_HYDRATE_MAX_IDS)
  if (unique.length === 0) return { posts: [], cost: 0 }

  const resp = await alphaGet<SearchApiResponse>(
    'tweets',
    {
      ids: unique.join(','),
      'tweet.fields': POST_FIELDS.join(','),
      expansions: POST_EXPANSIONS.join(','),
      'user.fields': 'id,name,username',
    },
    signal,
  )
  // Map same as fetchSearchRecent → AlphaPostCard[]
  // cost: COST_PER_POST * posts.length
}
```

Reuse the same response mapping as `fetchSearchRecent` (extract a shared `mapSearchPosts(resp)` private helper to avoid duplication).

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/alpha/x-alpha-client.ts src/lib/alpha/x-alpha-client.test.ts
git commit -m "$(cat <<'EOF'
feat(alpha): fetch posts by id for cluster hydrate

EOF
)"
```

---

### Task 4: Alpha UI — cluster hydrate + auto-keep + pin

**Files:**
- Modify: `src/components/compose/alpha/alpha-view.tsx`

- [ ] **Step 1: On Alpha mount, call `pruneCold()`**

```typescript
useEffect(() => {
  useAlphaStore.getState().pruneCold()
}, [])
```

- [ ] **Step 2: After `fetchNewsScan` succeeds, auto-keep stories**

```typescript
for (const st of res.stories) {
  keepStory({
    id: st.id,
    name: st.name,
    hook: st.hook,
    summary: st.summary,
    category: st.category,
    clusterPostIds: st.clusterPostIds,
    url: st.url,
    fetchedAt: Date.now(),
    pinned: false,
  })
}
```

- [ ] **Step 3: Add “Load cluster” on each X News card**

When clicked (and X connected):

```typescript
const ids = st.clusterPostIds.slice(0, ALPHA_HYDRATE_MAX_IDS)
const { posts, cost } = await fetchPostsByIds(ids)
keepPosts(
  posts.map((p) => ({
    ...p,
    fetchedAt: Date.now(),
    pinned: false,
    storyId: st.id,
  })),
)
addCost(cost)
// set local UI map storyId → posts for display
```

Show hydrated cards under the story; each post: link + **Reply** calling `openComposeForPost(p.id, { username: p.authorUsername })`.

- [ ] **Step 4: Pin controls**

Small “Pin” toggle on brief / story / hydrated post → `setColdPinned(...)`.

- [ ] **Step 5: Manual smoke (no automated UI test required)**

Connect X → Alpha → Refresh radar → Load cluster on a story → confirm posts render and survive refresh (cold). Confirm unpinned age-out only via unit tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/compose/alpha/alpha-view.tsx
git commit -m "$(cat <<'EOF'
feat(alpha): hydrate X News clusters into 24h cold archive

EOF
)"
```

---

### Task 5: Per-rail Grok briefs + keep cold

**Files:**
- Modify: `src/components/compose/alpha/alpha-view.tsx`
- Modify: `src/lib/alpha/grok-brief.ts` only if needed (prefer reuse)

- [ ] **Step 1: Add “Brief this rail” button per ranked rail**

On click:

```typescript
const res = await fetchAlphaGrokBrief({
  model: grokModelId,
  models,
  rails: [rail],
  countsByRail,
  extraContext: postsByRail[rail.id]
    ?.slice(0, 5)
    .map((p) => `@${p.authorUsername}: ${p.text.slice(0, 180)}`)
    .join('\n'),
})
const id = `brief-rail-${rail.id}-${res.fetchedAt}`
keepBrief({
  id,
  kind: 'rail',
  railId: rail.id,
  railLabel: rail.label,
  query: rail.query,
  markdown: res.markdown,
  model: res.model,
  fetchedAt: res.fetchedAt,
  pinned: false,
})
addCost(res.cost)
// show markdown under that rail (local state or read from store.briefs[id])
```

- [ ] **Step 2: Global brief also `keepBrief` with `kind: 'global'`**

Replace ephemeral-only `grokBrief` state: still show latest in UI, but always `keepBrief` on success. Prefer reading latest global from `briefs` sorted by `fetchedAt` for display after reload.

- [ ] **Step 3: Soft nudge on hottest rail**

If `ranked[0]` has no brief newer than counts TTL, show muted “Brief this?” next to the hottest rail label (not auto-run).

- [ ] **Step 4: Commit**

```bash
git add src/components/compose/alpha/alpha-view.tsx src/lib/alpha/grok-brief.ts
git commit -m "$(cat <<'EOF'
feat(alpha): per-rail Grok briefs with cold keep

EOF
)"
```

---

### Task 6: Compose `alpha_*` tools

**Files:**
- Create: `src/lib/compose/alpha-tools.ts`
- Create: `src/lib/compose/alpha-tools.test.ts`
- Modify: `src/lib/compose/compose-agent.ts`
- Modify: `src/lib/compose/compose-agent.test.ts` (assert tools registered if that file lists tool names)

- [ ] **Step 1: Failing tests for executor**

```typescript
import { describe, expect, it, beforeEach } from 'vitest'
import { COMPOSE_ALPHA_TOOLS, executeAlphaTool } from './alpha-tools'
import { useAlphaStore } from '../../stores/alpha-store'

beforeEach(() => {
  useAlphaStore.setState({
    briefs: {
      b1: {
        id: 'b1',
        kind: 'global',
        markdown: 'Sphere accelerating on X',
        model: 'grok',
        fetchedAt: Date.now(),
        pinned: false,
      },
    },
    stories: {},
    posts: {},
  })
  useAlphaStore.getState().pruneCold()
})

it('defines list/grep/get', () => {
  expect(COMPOSE_ALPHA_TOOLS.map((t) => t.function.name).sort()).toEqual([
    'alpha_get',
    'alpha_grep',
    'alpha_list',
  ])
})

it('alpha_grep finds brief', () => {
  const out = JSON.parse(executeAlphaTool('alpha_grep', { query: 'accelerating' }))
  expect(out.hits?.length).toBeGreaterThan(0)
})

it('alpha_get returns brief markdown', () => {
  const out = JSON.parse(executeAlphaTool('alpha_get', { kind: 'brief', id: 'b1' }))
  expect(out.markdown).toContain('Sphere')
})
```

- [ ] **Step 2: Implement `alpha-tools.ts`**

Mirror `intel-tools.ts` style:

- `COMPOSE_ALPHA_TOOLS`: three tool definitions  
- `executeAlphaTool(name, args): string` — reads `useAlphaStore.getState()`, calls `pruneCold` conceptually via reading already-pruned state (call `pruneCold()` once at start of execute), uses `listArchive` / `grepArchive` / `getBrief` / `getStoryWithPosts`, truncate to 32_000 chars JSON string  
- Unknown tool → `{ error: 'unknown tool' }`

- [ ] **Step 3: Register in `compose-agent.ts`**

```typescript
import { COMPOSE_ALPHA_TOOLS, executeAlphaTool } from './alpha-tools'

const tools = [
  ...COMPOSE_INTEL_TOOLS,
  ...COMPOSE_HISTORY_TOOLS,
  ...COMPOSE_STATS_TOOLS,
  ...COMPOSE_ALPHA_TOOLS,
  ...getComposeNewsTools({ xNewsOn }),
  ...
]
```

In the tool dispatch switch/if chain, add:

```typescript
if (name.startsWith('alpha_')) {
  result = executeAlphaTool(name, args)
}
```

(Match how `intel_` / `stats_` are branched — follow existing pattern exactly.)

- [ ] **Step 4: Run tests — PASS**

```bash
npx vitest run src/lib/compose/alpha-tools.test.ts src/lib/compose/compose-agent.test.ts --reporter=dot
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/compose/alpha-tools.ts src/lib/compose/alpha-tools.test.ts src/lib/compose/compose-agent.ts src/lib/compose/compose-agent.test.ts
git commit -m "$(cat <<'EOF'
feat(compose): alpha_list/grep/get over 24h Radar archive

EOF
)"
```

---

### Task 7: Alpha hot-window slice

**Files:**
- Create: `src/lib/compose/alpha-hot.ts`
- Create: `src/lib/compose/alpha-hot.test.ts`
- Modify: `src/hooks/use-compose.ts`
- Modify: `src/lib/compose/compose-prompt.ts`
- Modify: `src/lib/compose/compose-prompt.test.ts`

- [ ] **Step 1: Failing hot pack tests**

```typescript
import { describe, expect, it } from 'vitest'
import { formatAlphaHot, mergeHotWithAlpha, ALPHA_HOT_TOKEN_BUDGET } from './alpha-hot'
import type { AlphaArchiveState } from '../alpha/archive'

it('formats recent briefs and stories', () => {
  const state: AlphaArchiveState = {
    briefs: {
      b1: {
        id: 'b1',
        kind: 'global',
        markdown: '# Accel\n\nSomething big on X',
        model: 'grok',
        fetchedAt: Date.now(),
        pinned: false,
      },
    },
    stories: {
      s1: {
        id: 's1',
        name: 'Cluster story',
        clusterPostIds: ['1'],
        fetchedAt: Date.now(),
        pinned: false,
      },
    },
    posts: {},
  }
  const block = formatAlphaHot(state)
  expect(block).toContain('ALPHA RADAR')
  expect(block).toContain('b1')
  expect(block).toContain('Cluster story')
})

it('merge appends after intel text', () => {
  const { text } = mergeHotWithAlpha('===== LOCAL INTEL =====\nhi', {
    briefs: {},
    stories: {},
    posts: {},
  })
  expect(text).toContain('LOCAL INTEL')
})
```

- [ ] **Step 2: Implement `alpha-hot.ts`**

```typescript
export const ALPHA_HOT_TOKEN_BUDGET = 1000 // soft; trim briefs first if over

export function formatAlphaHot(state: AlphaArchiveState): string {
  // Newest 1 global brief (truncated markdown ~600 chars),
  // up to 2 rail briefs (titles/snippets),
  // up to 5 stories (id, name),
  // note: "24h window + pins; use alpha_* for more"
  // Return '' if nothing
}

export function mergeHotWithAlpha(
  priorText: string,
  state: AlphaArchiveState,
): { text: string; alphaTokens: number } {
  // Same pattern as mergeHotWithNewsBookmarks
}
```

Use `estimateTokens` from `token-estimate.ts`. If over `ALPHA_HOT_TOKEN_BUDGET`, drop story lines first, then shorten brief snippets.

- [ ] **Step 3: Wire `use-compose.ts`**

After news merge:

```typescript
const alphaState = {
  briefs: useAlphaStore.getState().briefs,
  stories: useAlphaStore.getState().stories,
  posts: useAlphaStore.getState().posts,
}
useAlphaStore.getState().pruneCold()
const { text: hotText } = mergeHotWithAlpha(
  mergeHotWithNewsBookmarks(pack.text, newsBookmarks).text,
  {
    briefs: useAlphaStore.getState().briefs,
    stories: useAlphaStore.getState().stories,
    posts: useAlphaStore.getState().posts,
  },
)
```

(Import `useAlphaStore`; prune once before packing.)

- [ ] **Step 4: Prompt updates in `compose-prompt.ts`**

In environment / tools sections add:

```
Alpha Radar (24h trending memory + pins):
- HOT WINDOW may include an ALPHA RADAR slice (recent briefs/stories).
- alpha_list / alpha_grep / alpha_get — cold pull from Alpha archive. Prefer hot slice first.
- intel_* remains for gathered profiles/posts; alpha_* is Radar-only.
```

Update `compose-prompt.test.ts` to assert `alpha_list` or `ALPHA RADAR` / `24h` appears when tools enabled.

- [ ] **Step 5: Run tests — PASS**

```bash
npx vitest run src/lib/compose/alpha-hot.test.ts src/lib/compose/compose-prompt.test.ts --reporter=dot
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/compose/alpha-hot.ts src/lib/compose/alpha-hot.test.ts src/hooks/use-compose.ts src/lib/compose/compose-prompt.ts src/lib/compose/compose-prompt.test.ts
git commit -m "$(cat <<'EOF'
feat(compose): inject Alpha 24h slice into hot window

EOF
)"
```

---

### Task 8: Thin Composer handoff

**Files:**
- Create: `src/lib/compose/open-alpha-compose.ts`
- Create: `src/lib/compose/open-alpha-compose.test.ts` (mock stores lightly or test pure seed builders)
- Modify: `src/components/compose/alpha/alpha-view.tsx`

- [ ] **Step 1: Pure seed builders + test**

```typescript
// open-alpha-compose.ts
export function buildBriefHandoffMessages(brief: AlphaColdBrief): {
  displayContent: string
  promptContent: string
} {
  const label =
    brief.kind === 'rail'
      ? `Alpha brief · ${brief.railLabel ?? brief.railId}`
      : 'Alpha brief · watchlist'
  return {
    displayContent: `${label} (handed off from Radar)`,
    promptContent: [
      `ALPHA HANDOFF (${label})`,
      brief.query ? `Query: ${brief.query}` : null,
      `Model: ${brief.model}`,
      '',
      brief.markdown,
      '',
      'Use this as research context. Draft only if I ask.',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

export function buildStoryHandoffMessages(story: AlphaColdStory): { ... }
export function buildRailHandoffMessages(rail: AlphaRail, velocityLine?: string): { ... }
```

```typescript
export function openComposeWithAlphaSeed(opts: {
  displayContent: string
  promptContent: string
}) {
  const store = useComposeStore.getState()
  const id = store.createThread(store.newThreadContext)
  store.selectThread(id)
  store.addMessage(id, {
    id: crypto.randomUUID(),
    role: 'user',
    content: opts.promptContent,
    // If ComposeMessage supports display override, set it; else content is fine
    createdAt: Date.now(),
  })
  store.setActivePostSubTab('composer')
  useXIntelStore.getState().setActiveTopTab('post')
  store.setDraftDrawerOpen(true)
}
```

Check `ComposeMessage` shape in `thread-types.ts` / compose-store — match exact fields (`id`, `role`, `content`, `createdAt`, etc.). If display/prompt split isn’t supported on messages, store `promptContent` as `content` and keep `displayContent` unused or as a one-line prefix.

- [ ] **Step 2: Wire Alpha UI buttons**

- Brief: Open in Composer → `buildBriefHandoffMessages` + `openComposeWithAlphaSeed`  
- Story: same with story builder  
- Rail: Open in Composer with query + velocity  
- Posts: existing `openComposeForPost`

- [ ] **Step 3: Unit test seed builders only**

Assert prompt contains markdown / story name / rail query.

- [ ] **Step 4: Commit**

```bash
git add src/lib/compose/open-alpha-compose.ts src/lib/compose/open-alpha-compose.test.ts src/components/compose/alpha/alpha-view.tsx
git commit -m "$(cat <<'EOF'
feat(alpha): thin Open in Composer handoff from Radar

EOF
)"
```

---

### Task 9: Spec status + regression sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-alpha-memory-handoff-design.md` (status → Implemented)
- Modify: `docs/superpowers/specs/2026-07-15-alpha-watchlist-design.md` if needed

- [ ] **Step 1: Run focused suites**

```bash
npx vitest run src/lib/alpha src/stores/alpha-store.test.ts src/lib/compose/alpha-tools.test.ts src/lib/compose/alpha-hot.test.ts src/lib/compose/open-alpha-compose.test.ts src/lib/compose/compose-prompt.test.ts --reporter=dot
```

Expected: all PASS

- [ ] **Step 2: Mark spec Implemented**

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-16-alpha-memory-handoff-design.md docs/superpowers/specs/2026-07-15-alpha-watchlist-design.md
git commit -m "$(cat <<'EOF'
docs: mark alpha memory + handoff spec implemented

EOF
)"
```

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| 24h cold + pins + prune | 1–2 |
| Auto-keep briefs/stories/hydrates | 4–5 |
| Cluster hydrate `tweets?ids=` | 3–4 |
| Per-rail briefs | 5 |
| `alpha_list/grep/get` | 6 |
| Hot-window Alpha slice | 7 |
| Thin handoff + Compose durability | 8 |
| Errors local / no empty brief store | 4–5 (skip keep on failure) |
| Rollout order | Tasks 1→8 |

## Placeholder / consistency notes

- Brief id scheme: `brief-global-${fetchedAt}` / `brief-rail-${railId}-${fetchedAt}`  
- `ALPHA_COLD_TTL_MS` single source in `default-rails.ts`  
- Archive field names on store: `briefs`, `stories`, `posts` (not nested `archive`) for simple partialize  
- Handoff does not call `compose_write_draft`
