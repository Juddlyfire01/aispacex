# Compose Intel Library — Stage 1 Design

**Date:** 2026-07-09  
**Status:** Draft for review  
**Product:** AiSpaceX (client-side Venice dashboard)  
**North star:** Community-pooled, privacy-preserving X intelligence (staged; not this release)

---

## 1. Intent

Equip the compose agent (Grok via Venice.ai — private, anonymised inference) with a **growing local corpus**, not only snapshot search or a flat prompt dump.

**Stage 1 goal:** Dual access over **X intel only** (self + targets):

1. **Hot window** — a healthy, budgeted serving of recent / high-value data in every compose turn  
2. **Cold library** — the full gathered set available via **grep- and glob-style tools**

This ports the *result* of NuSHA (`aispace_x_bot`) — hierarchical working memory + on-demand corpus search — without cloning its Python/SQLite server architecture.

**Out of scope for Stage 1:** News / Signal / Stats libraries, vector RAG, community pool, MCP server, agent write tools, storage engine rewrite.

---

## 2. Background & decisions

### 2.1 What worked in NuSHA

- Durable corpus + **compression ladder** (Signal → Cipher → …)  
- **Always inject** latest working memory; **search** cold history (FTS / tools)  
- Static system prompt; dynamic memory in the user turn  
- Tool surface as the API to self and world (Venice function calling)

Not required for the “satisfying” feel: embeddings / classic RAG.

### 2.2 What AiSpaceX has today

- Encrypted client stores: targets (`x-intel-store`), self (`x-self-store`)  
- Report history (analytics + narrative) for UI  
- Compose: ≤20 posts (single target) or flat dump ≤40 posts/subject (`build-corpus.ts`)  
- No compose tools; report narratives not fed to the agent  
- Playground already has a Venice tool-call loop (pattern to reuse)

### 2.3 Product decisions (locked)

| Decision | Choice |
|----------|--------|
| North star | Community pool (**C**), staged A → B → C |
| Stage 1 product | Dual access: hot + cold tools |
| Hot packing | **Auto** (budget-first) default; **Custom** (strict knobs + block when over) |
| Defaults | ~**7 days** preference, ~**50%** of **selected model** context, live token estimates |
| Retrieval | Grep + glob-style selectors — **not** vector RAG |
| Stage 1 domain | **X intel only**; stamp pattern later onto News → Signal → Stats |
| Storage for Stage 1 | Keep encrypted Zustand / `localStorage`; thin **`IntelLibrary`** interface |
| Stage 1.5 | Stronger local store **only if metrics require it** (see §9) |

### 2.4 Storage strategy (explicit)

**Do not redesign storage before Stage 1.**

- Highest-leverage gap is **agent access**, not the persistence engine.  
- Long-term better stack for a large multi-domain corpus: IndexedDB / OPFS + SQLite-wasm + FTS, same encryption philosophy, behind `IntelLibrary`.  
- That is **Stage 1.5 / domain-specific stores**, not a prerequisite.  
- **Hard rule:** packer and tools never touch stores directly — only `IntelLibrary` — so backends can swap without rewriting the agent.

---

## 3. Architecture

### 3.1 Layers

```
Compose UI  (Me | @target | All · Auto|Custom · token meter)
        │
        ├─► HotWindowPacker + TokenEstimator  ──► dynamic hot block in prompt
        │
        └─► Compose agent loop + COMPOSE_INTEL_TOOLS
                    │
                    ▼
              IntelLibrary  (read API)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
  x-self-store  x-intel-store  (later: news / signal / stats)
```

### 3.2 Units

| Unit | Responsibility |
|------|----------------|
| **`IntelLibrary`** | List subjects; get profile / posts / reports / edges; grep; glob; scope-aware |
| **`HotWindowPacker`** | Ranked, budgeted text for Me / @target / All under Auto or Custom |
| **`TokenEstimator`** | Approximate tokens for UI + packing (`ceil(chars/4)` Stage 1) |
| **`Compose tools`** | OpenAI-style tools executed in-browser against `IntelLibrary` |
| **`Compose agent loop`** | Extend streaming compose: handle `tool_calls`, cap rounds, parse postdraft |
| **Compose library settings** | Persist Auto/Custom, budget %, day window |

### 3.3 What replaces what

| Today | Stage 1 |
|-------|---------|
| `buildCorpus()` flat dump | Hot packer |
| Target ≤20 posts in system prompt | Scoped hot packer |
| Me: little/no local injection | Self hot window + self-scoped tools |
| No compose tools | Tool loop over full X library in scope |
| Report narratives UI-only | Prefer latest report(s) in hot set; history via tools |

### 3.4 Future community (C) alignment

Scopes eventually: `self` | `local` | `pool`. Stage 1 implements **local** only, with Me / @target / All as UI scopes. Shared tool names later map to pool backends without a new mental model.

---

## 4. Data flow & packing

### 4.1 Per send

1. Resolve scope from active context (Me / @target / All)  
2. Load library settings  
3. Resolve model context limit (metadata or fallback)  
4. Pack hot window + estimate tokens  
5. **Custom:** if hot > budget → **block send** with actionable UI  
6. **Auto:** packer already truncated to budget; never block for size  
7. Messages: static system + hot block + transcript  
8. Venice chat; on `tool_calls` → execute → continue (tool results **outside** hot budget; turn-local)  
9. Final text → existing ```postdraft parse  

Live X search (`enable_x_search`) remains independent of the local library.

### 4.2 Scope

| Context | Hot + tools |
|---------|-------------|
| **Me** | Connected self account(s) only |
| **@target** | That target only |
| **All** | Every self + every target |

Stage 1: model cannot widen scope beyond the UI context.

### 4.3 Hot ranking (fill order)

1. Pinned / bookmarked (self bookmarks Stage 1)  
2. Latest intel report per subject (narrative + short analytics)  
3. Profile one-liner per subject  
4. Posts within preferred day window (newest first; soft engagement tie-break)  
5. **Auto only if under budget:** older posts + prior report snapshots  
6. Compact top-N edges if budget remains  

Default omit from hot (tools only): full edge dumps, cost metadata, media binaries, low-signal deep history.

### 4.4 Auto vs Custom

| | Auto (default) | Custom |
|--|----------------|--------|
| Budget | `f(modelLimit, budgetPct, reserved)` · default 50% | Same, user-controlled |
| Day window | Preference (default 7), not a hard wall | Hard intent: full window must fit or **block** |
| Under budget | Fill older high-value items | Do not auto-expand past day window |
| Over budget | Truncate lowest priority / oldest | Refuse send |
| UI | Meter only | Meter + warning + disabled send |

Shared knobs: `budgetPct` (default 0.5), `dayWindowDays` (default 7; null = all-time preference). Domain toggles: X on; News/Signal/Stats disabled (“Coming next”).

### 4.5 Token math

- Estimate: `ceil(chars / 4)` — labelled approximate  
- Budget applies to **selected model** context limit  
- Unknown limit: conservative fallback (e.g. **128k**) until metadata available; 1M models scale automatically  
- **Reserved overhead** (system + tools + typical headroom): constant, e.g. `min(8_000, 10% of context)` — packer budgets against `contextLimit - reserved`  
- UI: Hot · Budget · Headroom · Library counts (posts/reports in scope)

### 4.6 Prompt shape

```
system:  ghostwriter rules + tool rules + postdraft contract  (static; no corpus dump)

user:    [HOT WINDOW]
         ===== LOCAL INTEL (scope: …) =====
         ...packed text...
         ===== END · use tools for anything not above =====
         ---
         <user message>
```

Re-pack hot on **every send**. Tool results only in that turn’s messages.

### 4.7 Empty / errors

| Case | Behavior |
|------|----------|
| Nothing gathered | No hot block; tools empty; plain ghostwriter (+ optional X search) |
| Custom over budget | Block + suggestions |
| Tool error | Short error string to model; no crash |
| Model ignores tools | Hot window still valuable |

---

## 5. Tool surface & agent loop

### 5.1 Loop

1. Pack hot  
2. Call Venice `/chat/completions` with tools, `tool_choice: auto`  
3. On `tool_calls`: execute via `IntelLibrary`, append `role: tool`, repeat  
4. Max **6** rounds per user send  
5. Parallel tool calls allowed in one round  
6. Final content → postdraft parse as today  

Handle streaming and non-streaming tool-call variants; buffer until tools resolve.

### 5.2 Tools

| Tool | Role |
|------|------|
| `intel_list_subjects` | Handles, counts, refresh, has report |
| `intel_glob` | Path-style list (navigation) |
| `intel_grep` | Keyword search (content) |
| `intel_get_profile` | Full profile |
| `intel_get_posts` | Filtered posts / bookmarks / likes |
| `intel_get_report` | Latest or by id |
| `intel_get_edges` | Top-N edges |

### 5.3 Path language (`intel_glob`)

```
intel/{self|target}/@{handle}/profile
intel/{self|target}/@{handle}/posts
intel/{self|target}/@{handle}/posts/{yyyy-mm-dd}
intel/{self|target}/@{handle}/reports
intel/{self|target}/@{handle}/reports/{reportId}
intel/{self|target}/@{handle}/edges
intel/{self|target}/@{handle}/bookmarks   # self only
intel/{self|target}/@{handle}/likes       # self only
```

Returns paths + short metadata, not full bodies.

### 5.4 Grep (`intel_grep`)

- `query`: required; all space-separated terms must match (case-insensitive)  
- `types`: posts | reports | profiles | edges | all  
- `handle`, `since`, `until` optional  
- `limit`: default 20, max 50  
- Hits: handle, type, id/date, ~200 char snippet  

Stage 1: in-memory substring/token filter. Same tool name later maps to FTS.

### 5.5 Get tools (caps)

- Posts: default limit 15, max 40; `source`: posts | bookmarks | likes (self)  
- Report: narrative + key analytics  
- Edges: default limit 20  

### 5.6 Tool payload guardrails

| Control | Default |
|---------|---------|
| Max rounds | 6 |
| Grep hits | ≤ 50 |
| Posts per get | ≤ 40 |
| Soft single result | ~8k tokens; truncate + “tighten filters” |
| Soft total tool payload / turn | ~32k tokens |

### 5.7 System rules (tools)

- Prefer hot window; tools for missing / older / deeper  
- Never invent post ids, handles, or quotes  
- Reply/quote only with real ids from hot or tools  
- Empty tools → say so  
- No full-library dumps via tools  

### 5.8 Local vs live X search

| Source | Use |
|--------|-----|
| Hot + tools | Local gathered corpus |
| `enable_x_search` | Live public X/web |

Prefer local ids for reply/quote.

### 5.9 Explicit non-tools (Stage 1)

- Write tools (thesis, interests)  
- Re-gather via tools  
- News/Signal/Stats tools  
- MCP for external editors  
- Embeddings search  

---

## 6. UI & settings

### 6.1 Placement

Intel → Post compose chrome, beside context / model / X-search.

### 6.2 Controls

| Control | Default |
|---------|---------|
| Library mode | Auto |
| Budget | 50% of model context |
| Day window | 7 days (options: 1 / 3 / 7 / 14 / 30 / All time) |
| Token meter | Always visible when compose open |
| Domains | X on; others disabled “Coming next” |

### 6.3 Token meter

```
Hot ~18.4k · Budget 64k (50% of 128k) · Headroom 45.6k · Library 1,240 posts · 12 reports
```

Custom over budget: warning styling + send disabled + panel with actions (raise %, shorten window, Auto, narrow context).

### 6.4 Tool activity

Lightweight status chips (`Library · grep "…"`). Do not dump raw tool JSON into the transcript by default.

### 6.5 Persistence

On compose settings:

- `libraryMode: 'auto' | 'custom'`  
- `budgetPct: number` (clamped, e.g. 0.25–0.75)  
- `dayWindowDays: number | null`  

Reserved overhead: code constant, not user-facing Stage 1.

### 6.6 Empty state

Hot 0 / Library 0 + short hint to gather or connect X.

---

## 7. Mental model (all domains, Stage 1 proves it on X)

For every data domain:

| Layer | Role |
|-------|------|
| **Hot** | ~budgeted window; bookmarks/pinned first; ~7d preference |
| **Cold** | Full library via grep + glob |

**News template (later):** selected-feed headlines greppable; bookmarks always hot.  
Same template for Signal / Stats snapshots.

Target hot size philosophy: a **healthy serving** for strong long-context models, default ~**50%** of the **active** model limit (not a fixed absolute).

---

## 8. Testing & acceptance

### 8.1 Acceptance

- Auto packs under budget; Custom blocks when over  
- Me / @target / All scopes correct for hot and tools  
- Meter tracks model / % / days / corpus  
- Agent can answer questions requiring data outside hot window  
- Agent can use report narrative and real post ids  
- Streaming, postdraft, X-search, encryption unchanged  
- Empty corpus still composable  
- No new server-side persistence of intel  

### 8.2 Automated tests

- Packer ranking, truncation, Custom over-budget, scope filters  
- Grep/glob matchers, token helper  
- Tool executors (scoped, capped)  
- Light mock of tool_calls → second round → final content  

### 8.3 Manual

Real gather → Auto draft; Custom block; “what did they say about X last month?”

---

## 9. Stage 1.5 gate (storage upgrade)

Stage 1.5 = stronger local store (IndexedDB / SQLite-wasm + FTS) **behind the same `IntelLibrary` API**.

### 9.1 Hard triggers (any one)

| Trigger | Threshold |
|---------|-----------|
| Persistence ceiling | ~1.5–2 MB serialized intel, or quota errors on save |
| Interactive jank | Pack or grep regularly > 200–300 ms main-thread |
| Hydrate pain | Load regularly > 2–3 s or tab freezes |
| Search quality | Known content unfindable after cheap ranking/tokenization fixes |

### 9.2 Soft triggers (two sustained)

| Trigger | Threshold |
|---------|-----------|
| Corpus size | ≳ 5–10k posts or ≳ 50 subjects with full history |
| Tool rounds | Median > 4–5 rounds mostly due to bad grep |
| Overflows | Frequent context issues despite budgeter |
| Multi-tab refresh | Painful full re-decrypt of giant JSON |

### 9.3 Non-triggers

Community pool, “want RAG,” single slow machine, News needing *its own* store (can start IndexedDB for News without migrating X).

### 9.4 Cheaper remedies first

1. Budgeted hot window (Stage 1)  
2. Grep caps + ranking  
3. In-memory token index / worker  
4. **Then** Stage 1.5  

**Gate one-liner:** Stage 1.5 when local intel cannot be saved reliably, or pack/grep/load regularly exceeds interactive budgets after in-memory indexing — not merely because the corpus is “big.”

---

## 10. Roadmap

```
Stage 1   ← this spec
  X intel: IntelLibrary + hot packer + tools + Auto/Custom UI

Stage 1.5  only if §9
  Durable client DB + FTS behind same API

Stage 2
  Compression ladder (Signal → Cipher-like layers)
  Optional agent-writable thesis / interests

Stage 3
  Stamp dual-access onto News → Signal → Stats

Stage 4
  Portable distilled packs (export/import)

Stage 5  — north star C
  Opt-in community pool + scopes self | local | pool
```

---

## 11. Key implementation touchpoints (guidance)

| Area | Likely location |
|------|-----------------|
| Library API | `src/lib/intel-library/` (new) |
| Packer / estimator | `src/lib/compose/hot-window.ts`, `token-estimate.ts` |
| Replace dump | Retire/slim `build-corpus.ts` usage |
| Prompt | `compose-prompt.ts` — static system; hot in user turn |
| Agent loop | `use-compose.ts` + shared tool runner (factor from `playground-agent-tools.ts` if sensible) |
| Tools | `src/lib/compose/intel-tools.ts` |
| Settings + meter UI | `compose-store` + `compose-workspace` / chrome |
| Types | Existing `Post`, `Profile`, `IntelReport`, report snapshots |

Privacy: continue device-bound encryption for stores; tools run only in the user’s browser.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Model/tool streaming quirks | Shared robust loop; hot-only fallback if tools unsupported |
| Token estimate error | Label approx; reserved overhead; conservative fallback limit |
| Large All corpus | Caps, optional in-memory index, §9 gate |
| Invented post ids | Prompt rules; prefer validating ids against library when drafting reply/quote |
| Chat history growth | Re-pack hot each send; ephemeral tool results |

---

## 13. Success definition (Stage 1)

A user with gathered self and targets can open Post, leave **Auto** defaults, and the agent:

1. Drafts with a **rich, current** local picture (~week preference, budgeted), and  
2. Can **search the full library** when asked about older or specific material, and  
3. Shows **honest token estimates**, with **Custom** available for strict control —

without leaving the privacy-first, Venice-centered client architecture.

---

## 14. Spec self-review notes

- No TBD placeholders for Stage 1 behavior  
- Storage non-redesign and 1.5 gates are explicit  
- Domain staging (X first) matches ambition without boiling the ocean  
- Community C is directional only; no fake Stage 1 requirements for pooling  

---

*End of Stage 1 design. Implementation plan follows user approval of this document.*
