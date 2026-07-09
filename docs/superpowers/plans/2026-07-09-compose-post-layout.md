# Compose Post Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Post tab into a You/Others-style history rail, media-style settings column, chat-primary work surface with draft drawer, and dual-access cold history tools for the compose agent.

**Architecture:** Replace one-session-per-context keys with `ComposeThread` records (sticky `ComposeScope`, messages, draft, rail meta). Pure `history-library` + agent tools for cold search. UI shell: `HistoryRail | ComposeSettings | Chat + DraftDrawer`. Intel hot window still packs from the active thread’s sticky scope.

**Tech Stack:** React 19, Zustand persist, Vitest, existing `GenerationView` widths, rail chrome, `estimateTokens`, Stage 1 intel packer/agent.

**Spec:** `docs/superpowers/specs/2026-07-09-compose-post-layout-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/lib/compose/thread-meta.ts` | Pure: auto-title, preview, token estimate, context badge label, relative time, token display |
| `src/lib/compose/thread-meta.test.ts` | Unit tests for meta helpers |
| `src/lib/compose/history-library.ts` | Cold list/grep/glob/get over threads snapshot |
| `src/lib/compose/history-library.test.ts` | History library tests |
| `src/lib/compose/history-tools.ts` | Tool schemas + `executeHistoryTool` |
| `src/lib/compose/history-tools.test.ts` | Tool executor tests |
| `src/lib/compose/compose-agent.ts` | Register history tools alongside intel tools |
| `src/lib/compose/compose-prompt.ts` | History tool rules in system prompt |
| `src/stores/compose-store.ts` | Threads model, migrate v3→v4, thread-scoped actions |
| `src/stores/compose-store.test.ts` | Rewrite for threads + migrate |
| `src/hooks/use-compose.ts` | Active thread + sticky scope packer |
| `src/lib/compose/open-compose.ts` | Deep-link → create/select tagged thread |
| `src/components/compose/history-rail.tsx` | Rail UI |
| `src/components/compose/compose-settings.tsx` | Settings column |
| `src/components/compose/draft-drawer.tsx` | Draft overlay |
| `src/components/compose/compose-workspace.tsx` | Shell layout |
| `src/components/compose/compose-chat.tsx` | Active thread; Draft open control |
| `src/components/compose/post-composer.tsx` | Read draft by `threadId` / active |
| `src/components/compose/compose-actions.tsx` | Same |
| `src/components/compose/library-meter.tsx` | Used inside settings (may simplify props) |

---

### Task 1: Thread meta helpers

**Files:**
- Create: `src/lib/compose/thread-meta.ts`
- Create: `src/lib/compose/thread-meta.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/compose/thread-meta.test.ts
import { describe, it, expect } from 'vitest'
import {
  autoTitleFromUserText,
  messagePreview,
  estimateThreadTokens,
  contextBadgeLabel,
  formatRelativeTime,
  formatTokenCount,
  scopeToPathSegment,
} from './thread-meta'
import type { ComposeScope } from '../intel-library/types'
import type { ChatMessage } from '../../types/venice'
import type { PostDraft } from './types'
import { emptyDraft } from './types'

describe('autoTitleFromUserText', () => {
  it('collapses whitespace and truncates to 60', () => {
    expect(autoTitleFromUserText('  hello   world  ')).toBe('hello world')
    const long = 'a'.repeat(80)
    expect(autoTitleFromUserText(long).length).toBe(60)
  })
  it('empty becomes New chat', () => {
    expect(autoTitleFromUserText('')).toBe('New chat')
    expect(autoTitleFromUserText('   ')).toBe('New chat')
  })
})

describe('contextBadgeLabel', () => {
  it('labels scopes', () => {
    expect(contextBadgeLabel({ type: 'me' })).toBe('You')
    expect(contextBadgeLabel({ type: 'all' })).toBe('All')
    expect(contextBadgeLabel({ type: 'target', username: 'AskVenice' })).toBe('@AskVenice')
  })
})

describe('scopeToPathSegment', () => {
  it('builds glob path segments', () => {
    expect(scopeToPathSegment({ type: 'me' })).toBe('me')
    expect(scopeToPathSegment({ type: 'all' })).toBe('all')
    expect(scopeToPathSegment({ type: 'target', username: 'AskVenice' })).toBe('target/@AskVenice')
  })
})

describe('messagePreview', () => {
  it('prefers first user line', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'First idea about privacy' },
      { role: 'assistant', content: 'Sure' },
    ]
    expect(messagePreview(msgs)).toContain('First idea')
  })
})

describe('estimateThreadTokens', () => {
  it('is positive for non-empty messages', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: 'abcd' }]
    const draft = emptyDraft({ kind: 'original' })
    expect(estimateThreadTokens(msgs, draft)).toBeGreaterThan(0)
  })
})

describe('formatTokenCount', () => {
  it('formats k', () => {
    expect(formatTokenCount(500)).toBe('~500')
    expect(formatTokenCount(1200)).toBe('~1.2k')
  })
})

describe('formatRelativeTime', () => {
  it('returns a non-empty string', () => {
    const iso = new Date().toISOString()
    expect(formatRelativeTime(iso, new Date()).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/lib/compose/thread-meta.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/compose/thread-meta.ts
import type { ChatMessage } from '../../types/venice'
import type { ComposeScope } from '../intel-library/types'
import type { PostDraft } from './types'
import { estimateTokens } from './token-estimate'

export function autoTitleFromUserText(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return 'New chat'
  return t.length <= 60 ? t : t.slice(0, 60)
}

export function contextBadgeLabel(scope: ComposeScope): string {
  if (scope.type === 'me') return 'You'
  if (scope.type === 'all') return 'All'
  return `@${scope.username.replace(/^@/, '')}`
}

export function scopeToPathSegment(scope: ComposeScope): string {
  if (scope.type === 'me') return 'me'
  if (scope.type === 'all') return 'all'
  return `target/@${scope.username.replace(/^@/, '')}`
}

export function messageContentString(m: ChatMessage): string {
  if (typeof m.content === 'string') return m.content
  if (m.content == null) return ''
  if (Array.isArray(m.content)) {
    return m.content
      .map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text?: string }).text ?? '') : ''))
      .join(' ')
  }
  return ''
}

export function messagePreview(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (firstUser) {
    const t = messageContentString(firstUser).replace(/\s+/g, ' ').trim()
    if (t) return t.length <= 80 ? t : `${t.slice(0, 80)}…`
  }
  return 'New chat'
}

export function estimateThreadTokens(messages: ChatMessage[], draft: PostDraft): number {
  const msgText = messages.map(messageContentString).join('\n')
  const draftText = draft.segments.map((s) => s.text).join('\n')
  return estimateTokens(msgText + '\n' + draftText)
}

export function formatTokenCount(n: number): string {
  if (n < 1000) return `~${n}`
  const k = n / 1000
  const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10
  return `~${rounded}k`
}

/** Simple relative time; pass `now` for tests. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const sec = Math.max(0, Math.floor((now.getTime() - t) / 1000))
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 14) return `${day}d ago`
  return iso.slice(0, 10)
}

export function recomputeThreadMeta(input: {
  messages: ChatMessage[]
  draft: PostDraft
  title: string
  now?: Date
}): { title: string; preview: string; tokenEstimate: number; updatedAt: string } {
  const now = input.now ?? new Date()
  const preview = messagePreview(input.messages)
  let title = input.title
  if (!title || title === 'New chat') {
    const firstUser = input.messages.find((m) => m.role === 'user')
    if (firstUser) title = autoTitleFromUserText(messageContentString(firstUser))
  }
  return {
    title,
    preview,
    tokenEstimate: estimateThreadTokens(input.messages, input.draft),
    updatedAt: now.toISOString(),
  }
}
```

- [ ] **Step 4: Run tests — PASS**

```bash
npm test -- src/lib/compose/thread-meta.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/compose/thread-meta.ts src/lib/compose/thread-meta.test.ts
git commit -m "feat(compose): thread meta helpers for history rail"
```

---

### Task 2: Compose store — threads + migrate v4

**Files:**
- Modify: `src/stores/compose-store.ts`
- Modify: `src/stores/compose-store.test.ts`
- Modify: `src/lib/intel-library/scope.ts` — add reverse helpers if needed (see below)

**Breaking change:** Replace `sessions` / `activeContext` public API with `threads` / `threadOrder` / `activeThreadId`. Keep `ME_CONTEXT` / `ALL_CONTEXT` exports for migrate + scope serialization.

- [ ] **Step 1: Add scope serialization helpers** (in `src/lib/intel-library/scope.ts` or store file)

```typescript
import type { ComposeScope } from './types'
import { ME_CONTEXT, ALL_CONTEXT } from '../../stores/compose-store'

export function scopeFromContext(activeContext: string): ComposeScope {
  if (activeContext === ME_CONTEXT) return { type: 'me' }
  if (activeContext === ALL_CONTEXT) return { type: 'all' }
  return { type: 'target', username: activeContext.replace(/^@/, '') }
}

export function contextKeyFromScope(scope: ComposeScope): string {
  if (scope.type === 'me') return ME_CONTEXT
  if (scope.type === 'all') return ALL_CONTEXT
  return scope.username.replace(/^@/, '')
}
```

- [ ] **Step 2: Rewrite store types and actions**

Core shape:

```typescript
import type { ComposeScope } from '../lib/intel-library/types'
import { recomputeThreadMeta } from '../lib/compose/thread-meta'
import { scopeFromContext, contextKeyFromScope } from '../lib/intel-library/scope'

export interface ComposeThread {
  id: string
  context: ComposeScope
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
  draft: PostDraft
  tokenEstimate: number
  preview: string
}

// State fields:
// threads, threadOrder, activeThreadId, newThreadContext: ComposeScope
// (plus existing model, xSearch, library*, longform*, ephemeral)

// Actions:
// createThread(context?: ComposeScope, target?: PostTarget): string
// selectThread(id: string | null)
// deleteThread(id: string)
// ensureActiveThread(): string  // create with newThreadContext if none
// getActiveThread(): ComposeThread | undefined
// addMessage(threadId, msg) + recompute meta
// appendToLastAssistant(threadId, token)
// setLastAssistantContent(threadId, content) + recompute
// applyDraftPatch / setSegment* / resetDraft(threadId, ...)
// setNewThreadContext(scope)
```

Implementation notes:

- `createThread`: `id = crypto.randomUUID()` (or `uuid()` polyfill — browser has randomUUID). Push id to front of `threadOrder`. Set `activeThreadId`. Initial `title: 'New chat'`, `preview: 'New chat'`, `tokenEstimate: 0`.
- After any message/draft mutation: call `recomputeThreadMeta`, update thread, **move id to front of threadOrder**.
- `deleteThread`: remove from map/order; if was active, select `threadOrder[0]` or null.
- Message APIs take `threadId` not context string.
- Persist `version: 4`.

**Migrate (persist migrate fn):**

```typescript
// if version < 4 and persisted.sessions exists:
const sessions = persisted.sessions as Record<string, { messages: ChatMessage[]; draft: PostDraft }>
const threads: Record<string, ComposeThread> = {}
const threadOrder: string[] = []
for (const [key, sess] of Object.entries(sessions)) {
  const id = crypto.randomUUID()
  const context = scopeFromContext(key)
  const meta = recomputeThreadMeta({
    messages: sess.messages ?? [],
    draft: sess.draft,
    title: 'New chat',
  })
  threads[id] = {
    id,
    context,
    createdAt: sess.draft?.createdAt ?? meta.updatedAt,
    ...meta,
    messages: sess.messages ?? [],
    draft: sess.draft,
  }
  threadOrder.push(id)
}
threadOrder.sort((a, b) => (threads[b].updatedAt > threads[a].updatedAt ? 1 : -1))
// activeThreadId: find thread whose contextKey matches persisted.activeContext, else threadOrder[0]
// newThreadContext: scopeFromContext(persisted.activeContext ?? ALL_CONTEXT)
// delete sessions, activeContext from state
```

For Node/vitest without `crypto.randomUUID`, use:

```typescript
function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
```

- [ ] **Step 3: Rewrite `compose-store.test.ts`**

Cover: createThread, select, delete, addMessage recomputes title/preview, ensureActiveThread, migrate helper (export `migrateComposePersist` for test if cleaner).

- [ ] **Step 4: Temporarily fix compile breakages**

Any file still using `sessions` / `activeContext` will fail tsc. In this task, update **only** the store + tests. Other files break until Tasks 6–7 — acceptable if you batch with Task 6, OR add thin compatibility shims:

**Preferred for Task 2 alone:** complete store rewrite and fix all call sites in the same commit (expand Task 2) **or** land Task 2+6 together.

**Plan mandate:** After Task 2 commit, `npm test -- src/stores/compose-store.test.ts` passes. Full `tsc -b` may fail until Task 6–7. Prefer fixing call sites in Task 6 (use-compose + components) in the next commits without leaving the tree unbuildable longer than one task — **implementer should fix all `sessions`/`activeContext` references in the same PR branch before claiming Task 6 done**.

- [ ] **Step 5: Commit**

```bash
git add src/stores/compose-store.ts src/stores/compose-store.test.ts src/lib/intel-library/scope.ts
git commit -m "feat(compose): thread-based store with v4 session migration"
```

---

### Task 3: History library (cold store)

**Files:**
- Create: `src/lib/compose/history-library.ts`
- Create: `src/lib/compose/history-library.test.ts`

- [ ] **Step 1: Types + snapshot**

```typescript
// history-library.ts
import type { ComposeThread } from '../../stores/compose-store'
import type { ComposeScope } from '../intel-library/types'
import { messageContentString, scopeToPathSegment } from './thread-meta'

export interface HistorySnapshot {
  threads: ComposeThread[] // already newest-first preferred
}

export interface ThreadSummary {
  id: string
  context: ComposeScope
  title: string
  preview: string
  updatedAt: string
  tokenEstimate: number
  messageCount: number
}

export function buildHistorySnapshot(threads: Record<string, ComposeThread>, order: string[]): HistorySnapshot {
  const list = order.map((id) => threads[id]).filter(Boolean)
  return { threads: list }
}
```

- [ ] **Step 2: Implement list / grep / glob / get**

```typescript
export function listThreads(
  snap: HistorySnapshot,
  opts?: { query?: string; contextType?: ComposeScope['type']; limit?: number },
): ThreadSummary[] {
  let rows = snap.threads
  if (opts?.contextType) rows = rows.filter((t) => t.context.type === opts.contextType)
  if (opts?.query?.trim()) {
    const q = opts.query.toLowerCase()
    rows = rows.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q) ||
        t.messages.some((m) => messageContentString(m).toLowerCase().includes(q)),
    )
  }
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50))
  return rows.slice(0, limit).map((t) => ({
    id: t.id,
    context: t.context,
    title: t.title,
    preview: t.preview,
    updatedAt: t.updatedAt,
    tokenEstimate: t.tokenEstimate,
    messageCount: t.messages.length,
  }))
}

export interface HistoryGrepHit {
  threadId: string
  title: string
  role: string
  index: number
  snippet: string
}

export function grepHistory(
  snap: HistorySnapshot,
  opts: { query: string; threadId?: string; limit?: number },
): HistoryGrepHit[] {
  const terms = opts.query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const limit = Math.min(50, Math.max(0, opts.limit ?? 20))
  if (limit === 0) return []
  const hits: HistoryGrepHit[] = []
  for (const t of snap.threads) {
    if (opts.threadId && t.id !== opts.threadId) continue
    t.messages.forEach((m, index) => {
      if (hits.length >= limit) return
      const hay = messageContentString(m).toLowerCase()
      if (!terms.every((term) => hay.includes(term))) return
      const raw = messageContentString(m)
      hits.push({
        threadId: t.id,
        title: t.title,
        role: m.role,
        index,
        snippet: raw.length > 200 ? `${raw.slice(0, 200)}…` : raw,
      })
    })
    if (hits.length >= limit) break
  }
  return hits
}

// Reuse glob→regex pattern from intel-library (copy small globToRegExp or import if exported)
export function globHistory(snap: HistorySnapshot, pattern: string): { path: string; meta: ThreadSummary }[] {
  // Enumerate path: history/{scopeToPathSegment}/{id}
  // Match with glob
}

export function getThread(
  snap: HistorySnapshot,
  id: string,
  opts?: { maxMessages?: number },
): ComposeThread | { error: string } {
  const t = snap.threads.find((x) => x.id === id)
  if (!t) return { error: 'thread_not_found' }
  const max = opts?.maxMessages ?? 40
  if (t.messages.length <= max) return t
  return { ...t, messages: t.messages.slice(-max), preview: t.preview /* note truncated */ }
}
```

Copy `globToRegExp` from `src/lib/intel-library/library.ts` into a shared util **or** duplicate the small function in history-library (YAGNI: duplicate ~20 lines is fine).

- [ ] **Step 3: Tests with fixture threads**

- [ ] **Step 4: Commit**

```bash
git add src/lib/compose/history-library.ts src/lib/compose/history-library.test.ts
git commit -m "feat(compose): cold history library list/grep/glob/get"
```

---

### Task 4: History tools + agent + prompt

**Files:**
- Create: `src/lib/compose/history-tools.ts`
- Create: `src/lib/compose/history-tools.test.ts`
- Modify: `src/lib/compose/compose-agent.ts`
- Modify: `src/lib/compose/compose-prompt.ts`
- Modify: `src/lib/compose/compose-prompt.test.ts`
- Modify: `src/lib/compose/compose-agent.test.ts` (if tool list asserted)

- [ ] **Step 1: Tools**

Exact names:

- `compose_history_list` — optional query, contextType, limit
- `compose_history_grep` — query, threadId?, limit?
- `compose_history_glob` — pattern
- `compose_history_get` — threadId, maxMessages?

```typescript
export const COMPOSE_HISTORY_TOOLS: ToolDefinition[] = [ /* ... */ ]

export function executeHistoryTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { snapshot: HistorySnapshot },
): unknown {
  // switch + try/catch + 32k truncate same as intel-tools
}
```

- [ ] **Step 2: Agent merges tools**

In `compose-agent.ts` / `runComposeAgent`:

```typescript
tools: [...COMPOSE_INTEL_TOOLS, ...COMPOSE_HISTORY_TOOLS],
```

Extend opts:

```typescript
historySnapshot: HistorySnapshot
```

When executing tools:

```typescript
if (name.startsWith('compose_history_')) {
  result = executeHistoryTool(name, args, { snapshot: opts.historySnapshot })
} else {
  result = executeIntelTool(name, args, { snapshot: opts.snapshot, scope: opts.scope })
}
```

- [ ] **Step 3: Prompt blurb when toolsEnabled**

Add rules: prefer active transcript; use `compose_history_*` for prior threads; never invent thread ids.

- [ ] **Step 4: Tests + commit**

```bash
git commit -m "feat(compose): history tools and agent dual-access"
```

---

### Task 5: History rail UI

**Files:**
- Create: `src/components/compose/history-rail.tsx`

- [ ] **Step 1: Implement rail**

Match `target-rail.tsx` / `self-rail.tsx` shell:

```tsx
// Structure
<div className="w-52 shrink-0 flex flex-col border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)]">
  <div className="p-2">
    <button type="button" className="/* RailTop min-h-9 full width */" onClick={() => createThread()}>
      + New chat
    </button>
  </div>
  <div className="px-2 pb-2">
    <input value={filter} onChange={...} placeholder="Search chats…" className="/* 11px input */" />
  </div>
  <div className="flex-1 overflow-y-auto px-1.5 pb-2">
    {rows.map(thread => (
      <div key={thread.id} onClick={() => selectThread(thread.id)} className="group relative flex ...">
        {active && <span className="absolute left-0 ... w-0.5 h-3.5 bg-[var(--color-accent)]" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-white/40">{contextBadgeLabel(thread.context)}</span>
            <span className="truncate text-[11px]">{thread.preview}</span>
          </div>
          <div className="text-[9px] text-white/30">
            {formatRelativeTime(thread.updatedAt)} · {formatTokenCount(thread.tokenEstimate)}
          </div>
        </div>
        <button className="opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); /* confirm if messages */ deleteThread(thread.id) }}>×</button>
      </div>
    ))}
    {empty && <div className="text-[11px] text-white/30 p-3">No chats yet — start with + New chat</div>}
  </div>
</div>
```

Filter: client-side over title/preview/messages via `listThreads` or inline filter.

`createThread()` uses `newThreadContext` from store.

- [ ] **Step 2: Commit**

```bash
git add src/components/compose/history-rail.tsx
git commit -m "feat(compose): history rail for Post threads"
```

---

### Task 6: Settings column + wire useCompose + open-compose

**Files:**
- Create: `src/components/compose/compose-settings.tsx`
- Modify: `src/hooks/use-compose.ts`
- Modify: `src/lib/compose/open-compose.ts`
- Modify: `src/components/compose/library-meter.tsx` (if props need simplification)

- [ ] **Step 1: ComposeSettings**

Column shell:

```tsx
<aside className="md:w-[360px] lg:w-[400px] shrink-0 border-r border-[var(--color-border-faint)] flex flex-col max-h-[55vh] md:max-h-none">
  <div className="p-5 flex flex-col gap-4 overflow-y-auto">
    {/* New-thread context: You | All | select target */}
    {/* Model Select */}
    {/* X search SegmentedControl */}
    {/* Library mode, budget, days — or embed LibraryMeter controls */}
    <LibraryMeter ... />
  </div>
</aside>
```

Use `Label`, `Select`, `SegmentedControl` / `PillGroup` from `src/components/ui/shared.tsx` and `select.tsx` / `sub-tabs.tsx` like image-view.

Pack snapshot for meter: same as current workspace (`buildIntelSnapshot`, scope from **active thread** context or `newThreadContext` for empty — **meter should use active thread.context if present, else newThreadContext**).

- [ ] **Step 2: useCompose**

```typescript
// send():
const store = useComposeStore.getState()
const threadId = store.ensureActiveThread()
const thread = store.threads[threadId]
const scope = thread.context
// pack intel with scope
// historySnapshot = buildHistorySnapshot(store.threads, store.threadOrder)
// runComposeAgent({ ..., historySnapshot, scope, snapshot: intelSnap })
// messages on threadId
// on postdraft: applyDraftPatch(threadId, ...); store.setDraftDrawerOpen(true) // if you put open state on store
```

Add to store **ephemeral** `draftDrawerOpen: boolean` + `setDraftDrawerOpen` (not persisted) — simplifies chat/workspace.

- [ ] **Step 3: open-compose**

```typescript
export function openComposeForTarget(username: string) {
  const scope = { type: 'target' as const, username: username.replace(/^@/, '') }
  const id = useComposeStore.getState().createThread(scope)
  useComposeStore.getState().selectThread(id)
  useComposeStore.getState().setDraftDrawerOpen(true)
  useXIntelStore.getState().setActiveTopTab('post')
}

export function syncComposeContextFromActiveTarget() {
  // Optional: set newThreadContext only; do not force-switch active thread
  const target = useXIntelStore.getState().activeTarget
  if (!target) return
  useComposeStore.getState().setNewThreadContext({ type: 'target', username: target })
}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(compose): settings column and thread-scoped send path"
```

---

### Task 7: Draft drawer + workspace shell + chat/composer props

**Files:**
- Create: `src/components/compose/draft-drawer.tsx`
- Modify: `src/components/compose/compose-workspace.tsx`
- Modify: `src/components/compose/compose-chat.tsx`
- Modify: `src/components/compose/post-composer.tsx`
- Modify: `src/components/compose/compose-actions.tsx`
- Modify: any remaining `context:` props → `threadId` from `activeThreadId`

- [ ] **Step 1: DraftDrawer**

```tsx
// fixed/absolute right panel when open
// w-[46%] max-w-[560px] h-full border-l bg base
// header: Draft + close button
// PostComposer + ComposeActions using activeThreadId
// Escape closes (useEffect keydown)
```

- [ ] **Step 2: ComposeWorkspace shell**

```tsx
<div className="flex flex-1 min-h-0">
  <HistoryRail />
  <ComposeSettings />
  <div className="flex-1 min-w-0 relative flex flex-col">
    <ComposeChat sendBlocked={...} onOpenDraft={() => setDraftDrawerOpen(true)} />
    <DraftDrawer />
  </div>
</div>
```

**Remove** the top controls bar entirely.

Ensure active thread on mount: `ensureActiveThread()`.

- [ ] **Step 3: ComposeChat**

- Read messages from `threads[activeThreadId]`
- Empty state mentions history rail + tools
- Button “Draft” opens drawer
- `send()` with no context arg

- [ ] **Step 4: PostComposer / ComposeActions**

- Use `activeThreadId` (or prop `threadId`) instead of `context` string
- All store calls: `applyDraftPatch(threadId, ...)`

- [ ] **Step 5: Build + tests**

```bash
npm test -- src/lib/compose/ src/stores/compose-store.test.ts src/lib/intel-library/
npm run build
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(compose): Post shell with settings, chat, and draft drawer"
```

---

### Task 8: Polish + acceptance

**Files:** any small fixes

- [ ] **Step 1: Checklist (code)**

| Check | Verify |
|-------|--------|
| + New chat creates thread, sticky context | store + UI |
| Switch thread restores messages/draft | store |
| Delete with confirm | rail |
| Rail search filters | rail |
| Auto-title on first user message | meta |
| Settings control model/xSearch/library | settings |
| No top bar | workspace |
| Draft drawer open on postdraft | use-compose |
| Deep-link Others pencil | open-compose |
| History tools in agent | compose-agent |
| Migrate v3 sessions | unit test |
| Custom over-budget blocks send | use-compose |
| Intel packer uses thread.context | use-compose |

- [ ] **Step 2: Manual QA note** in commit body

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(compose): Post layout acceptance polish"
```

---

## Spec coverage (self-review)

| Spec section | Task(s) |
|--------------|---------|
| Layout shell rail/settings/chat/drawer | 5, 6, 7 |
| History unit + sticky context + auto-title | 1, 2 |
| Row meta badge/time/tokens/preview | 1, 5 |
| Settings GenerationView style | 6 |
| Draft drawer open rules | 6, 7 |
| Dual-access hot active / cold tools | 3, 4 |
| Migrate v3→v4 | 2 |
| open-compose deep-link | 6 |
| Out of scope (rename, multi-sort, server) | not planned |

## Type consistency

- `ComposeThread` defined in store; history-library imports it (or move type to `src/lib/compose/types-thread.ts` if circular import — prefer type in `src/lib/compose/thread-types.ts` if store↔lib cycle appears).
- If cycle: put `ComposeThread` interface in `src/lib/compose/thread-types.ts`; store and history-library both import from there.

**Recommended:** Create `src/lib/compose/thread-types.ts` in Task 2 with `ComposeThread` interface to avoid cycles.

## Placeholder scan

No TBD steps; code sketches are complete enough for implementers to fill edge details without inventing product decisions.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-09-compose-post-layout.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh implementer per task, spec + quality review between tasks  
2. **Inline Execution** — implement in this session with checkpoints  

Which approach?
