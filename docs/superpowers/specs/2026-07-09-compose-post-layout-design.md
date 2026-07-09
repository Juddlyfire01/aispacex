# Compose Post Layout — History Rail, Settings Pane, Draft Drawer

**Date:** 2026-07-09  
**Status:** Approved for implementation planning  
**Branch:** `feat/compose-intel-library` (or follow-on feature branch)  
**Depends on:** Stage 1 dual-access intel library (hot window + `intel_*` tools)

---

## 1. Goal

Make the **Post** top-tab feel like the rest of X Intel: an intuitive frontend over a rich backend.

- **You / Others pattern:** left **rail** + main **pane**
- **Media pattern:** left **settings** column (Image / Audio / Music / Video `GenerationView`)
- **Chat primary:** full-width conversation; **draft** as a right drawer when needed
- **Continuity:** chronological **chat history** with context tags, time, token estimates; **grep/glob dual-access** over a cold history store for the agent

This is a **UI + store** redesign of compose. It does not change Venice inference ownership or reintroduce the flat corpus dump.

---

## 2. Problem (today)

| Area | Current | Pain |
|------|---------|------|
| Layout | Top control strip + chat \| draft split | Cramped; settings not in app vocabulary |
| Sessions | One `ComposeSession` per context key (`__me__`, `__all__`, `@user`) | Not a real “previous chats” log |
| Metadata | No per-message time/tokens; no thread list UI | Hard to scan continuity |
| History for agent | Only active transcript | No cold search across prior compose work |

---

## 3. Decisions (locked)

| Topic | Choice |
|-------|--------|
| History unit | **Thread** — grows until user clicks **+ New chat** |
| Context | **Sticky tag** at thread creation (`me` \| `all` \| `target@handle`) |
| Rail rows | Context badge · relative time · ~token estimate · first-line preview |
| Titles | **Auto-title** from first user message (no rename UI in v1) |
| Settings | **Left sidebar** in pane (`md:w-[360px]` / `lg:w-[400px]`, GenerationView-style) |
| Work surface | **Chat primary**; draft as **right drawer** |
| History dual-access | **Hot** = active thread only (already in transcript). **Cold** = all threads via list/grep/glob/get tools + rail filter |
| Sort (v1) | `updatedAt` descending only |

---

## 4. Layout shell

```
IntelView → Post tab
+----------------+--------------------+------------------------------+
| History rail   | Settings           | Chat (primary)               |
| w-52           | md:w-[360px]       | flex-1                       |
|                | lg:w-[400px]       |                              |
| + New chat     | Model, X search,   | [ Draft drawer → when open ] |
| search box     | library knobs,     |                              |
| thread list    | meter              |                              |
+----------------+--------------------+------------------------------+
```

- **No top control bar** on Post (controls move into settings).
- Outer structure matches You/Others: `flex flex-1 min-h-0` with a fixed-width rail.
- Settings column matches media: border-r, scrollable controls, meter near bottom of column.
- Narrow viewports: stack (history collapsible or horizontal scroll deferred; settings may collapse under a “Settings” toggle if width &lt; md — implementer may use GenerationView’s mobile `max-h` pattern).

### 4.1 History rail (copy You/Others chrome)

**Shell:** `w-52 shrink-0 flex flex-col border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)]`

| Zone | Content |
|------|---------|
| Top | `+ New chat` using `RailTop*` visual recipe (`min-h-9`, 11px). Creating a thread uses **new-thread context** from settings (You / All / @target). |
| Search | Text input; client-side filter over `preview` + message text |
| List | Newest first; active row = accent bar + primary text |
| Row | Badge `You` \| `All` \| `@handle` · truncated preview · subtitle: relative time · `~Nk` tokens |
| Hover | Delete (×); confirm if `messages.length > 0` |
| Empty | “No chats yet — start with + New chat” |
| Footer | Optional empty or tiny brand strip; **library meter stays in settings** |

### 4.2 Settings column (copy GenerationView)

Reuse `Label`, searchable `Select`, `SegmentedControl` / `PillGroup` from media views — not raw native selects in a top strip.

| Control | Notes |
|---------|--------|
| New-thread context | You / All / pick @target from intel targets (+ self). **Only applies to + New chat**, not mid-thread (sticky). |
| Model | Same model list as today |
| X search | off \| auto \| on |
| Library mode | Auto \| Custom |
| Budget % | 25 / 50 / 75 |
| Day window | 1 / 3 / 7 / 14 / 30 / All |
| Library meter | Existing `LibraryMeter` readout + Custom over-budget banner |
| Longform preference | Optional relocate from draft chrome (global seed for new drafts) |

### 4.3 Chat + draft drawer

- **Chat:** full remaining width; transcript + composer input; `toolActivity` under input; Custom over-budget still blocks send.
- **Draft drawer:** right overlay/panel ~46% width, max ~560px; contains `PostComposer` + `ComposeActions`.
- **Open when:** user opens Draft control; agent applies `postdraft`; draft has non-empty text segments.
- **Close:** × or Escape (draft data retained on the thread).
- Deep-link from You/Others compose pencil: create or focus a thread tagged with that context, switch to Post, optionally open draft drawer.

---

## 5. Data model

### 5.1 ComposeThread

```typescript
export interface ComposeThread {
  id: string
  /** Sticky intel scope for the life of the thread. */
  context: ComposeScope  // { type: 'me' } | { type: 'all' } | { type: 'target'; username }
  /** Auto from first user message; truncated. */
  title: string
  createdAt: string  // ISO
  updatedAt: string  // ISO
  messages: ChatMessage[]  // UI roles user/assistant only preferred; no system; no hot dumps
  draft: PostDraft
  /** Cached for rail; recompute on message/draft write. */
  tokenEstimate: number
  preview: string
}
```

### 5.2 Store (compose-store)

```typescript
threads: Record<string, ComposeThread>
threadOrder: string[]           // newest-first ids
activeThreadId: string | null
// retained globals:
model, xSearch, libraryMode, budgetPct, dayWindowDays, longformPreference
// ephemeral:
isStreaming, toolActivity, contextLimit
// new-thread context preference (persisted):
newThreadContext: ComposeScope | serialized form
```

**Actions (illustrative):**
- `createThread(context?)` → id, select active, push front of `threadOrder`
- `selectThread(id)`
- `deleteThread(id)`
- `addMessage` / draft patches / streaming helpers target **active thread**
- `recomputeThreadMeta(id)` → title (if still default/empty), preview, tokenEstimate, updatedAt

**Persist:** bump version (e.g. 4); partialize threads + order + activeThreadId + prefs; migrate v3 `sessions` map → one thread per old context key using draft timestamps / now; drop old `sessions` after migrate.

### 5.3 Auto-title

- On first user message: `title = firstLine.slice(0, 60)` (collapse whitespace).
- No manual rename in v1.
- Rail preview may show title or last-turn snippet; prefer **first user line** for stable scanning unless empty.

### 5.4 Token estimate

- `tokenEstimate = estimateTokens(joined message contents + optional draft text)` using existing `ceil(chars/4)` helper.
- Display as `~1.2k` on the row; not billing truth.

---

## 6. Dual-access history (agent)

### 6.1 Hot

- Active thread messages already flow through `useCompose` → `runComposeAgent` API transcript.
- Do **not** dump other threads into the prompt by default.

### 6.2 Cold library API

Pure module e.g. `src/lib/compose/history-library.ts` (name flexible):

| Function | Behavior |
|----------|----------|
| `listThreads(snap, opts)` | Filter by context / query; return summaries |
| `grepHistory(snap, { query, threadId?, limit? })` | AND whitespace terms, case-insensitive, over message text |
| `globHistory(snap, pattern)` | Paths like `history/me/{id}`, `history/all/{id}`, `history/target/@user/{id}` |
| `getThread(snap, id)` | Full or truncated messages; hard cap JSON size |

Snapshot built from store threads (same pattern as `buildIntelSnapshot`).

### 6.3 Tools (compose agent)

Add to tool surface (alongside `intel_*`):

| Tool | Purpose |
|------|---------|
| `compose_history_list` | Summaries (id, context, title, updatedAt, tokenEstimate) |
| `compose_history_grep` | Search message text |
| `compose_history_glob` | Path listing |
| `compose_history_get` | Fetch one thread (capped) |

System prompt: prefer active transcript; use history tools for prior threads; never invent thread ids.

### 6.4 Rail search

Client-only filter for humans; independent of agent tools (both read the same store).

---

## 7. Send path changes

`useCompose.send` already packs intel hot window and runs the agent. Adjustments:

1. Resolve **active thread** (create default thread if none).
2. Scope for intel packer = **thread.context** (sticky), not a separate dropdown.
3. UI messages append to that thread; API still injects hot prefix only on latest user turn.
4. Custom over-budget still blocks send.
5. After assistant content: parse `postdraft` → patch **thread.draft**; open draft drawer if patch applied.
6. Recompute thread meta (tokens, preview, updatedAt).

---

## 8. Component map

| Path | Responsibility |
|------|----------------|
| `src/components/compose/compose-workspace.tsx` | Shell: rail \| settings \| chat + drawer |
| `src/components/compose/history-rail.tsx` | New — list, search, + New, delete |
| `src/components/compose/compose-settings.tsx` | New — GenerationView-style controls + meter |
| `src/components/compose/compose-chat.tsx` | Chat only; no top-bar props |
| `src/components/compose/draft-drawer.tsx` | New — open state, PostComposer + actions |
| `src/components/compose/library-meter.tsx` | Relocate into settings (may drop standalone mode toggles if settings owns them) |
| `src/stores/compose-store.ts` | Threads model, migrate v3→v4 |
| `src/hooks/use-compose.ts` | Active thread + sticky scope |
| `src/lib/compose/history-library.ts` | Cold list/grep/glob/get |
| `src/lib/compose/intel-tools.ts` or `history-tools.ts` | Tool schemas + execute |
| `src/lib/compose/compose-prompt.ts` | History tool rules |
| `src/lib/compose/open-compose.ts` | Deep-link creates/selects tagged thread |

Reuse: `rail-top-control` patterns, `GenerationView` width classes, shared `Label`/`Select`/`SegmentedControl`.

---

## 9. Out of scope (v1)

- Manual thread rename
- Multi-sort (pinned, favorites) beyond `updatedAt` desc
- Server-side history sync / community pool
- Streaming token mid-reply (agent remains non-streaming Stage 1)
- Full mobile-first redesign of three columns (acceptable progressive collapse)
- Moving News/Signal/Stats into Post

---

## 10. Migration & compatibility

1. On load persist v&lt;4: for each `sessions[key]`, emit one `ComposeThread` with mapped scope, messages, draft, meta from draft times.
2. `activeThreadId` = thread matching old `activeContext` if any, else newest.
3. `newThreadContext` default from last active scope or `{ type: 'all' }`.
4. Remove `sessions` / `activeContext` from public API after migrate (keep private migrate helpers).

---

## 11. Testing

| Area | Tests |
|------|--------|
| Store | create/select/delete thread; meta recompute; migrate v3 fixtures |
| History library | list/grep/glob/get against fixture threads |
| Tools | execute history tools + truncation |
| UI (light) | optional: pure helpers for badge label, format relative time, token display |

Manual QA: + New, switch threads, sticky scope packer, draft drawer open on postdraft, rail search, Custom over-budget, deep-link from Others.

---

## 12. Success criteria

1. Post tab visually matches You/Others rail + media settings language.
2. User can scan **prior chats** with You/All/@, time, ~tokens, preview.
3. Settings no longer live in a top strip.
4. Chat is primary; draft is a drawer.
5. Agent can **grep/glob** cold compose history without stuffing all threads into the prompt.
6. Existing drafts/messages survive migration.

---

## 13. Implementation order (hint for plan)

1. Store: threads + migrate + meta helpers  
2. History library + unit tests  
3. History tools + prompt blurb  
4. History rail UI  
5. Settings column + remove top bar  
6. Draft drawer + chat full width  
7. Wire send/deep-link to active thread  
8. Polish + acceptance checklist  

---

## 14. Open items (non-blocking)

- Exact mobile collapse behavior for three columns  
- Whether longform preference moves in v1 or stays on draft  
- Confirm drawer animation (CSS only vs none)
