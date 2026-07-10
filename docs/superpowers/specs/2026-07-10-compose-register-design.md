# Compose Register (Style Transfer) Design

**Date:** 2026-07-10  
**Status:** Approved (Approach 1 — user: drive & build)

## Goal

Let the user pick a linguistic **Register** on the draft so the next compose agent turn injects a consistent voice pack (description, devices, few-shot exemplars). Default is **You** (self-report pack); app-wide default is overridable.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Placement | Draft drawer, under “Who can reply” |
| Apply timing | Next chat turn only (no auto-rewrite) |
| Default | `you`; app-wide preference overridable |
| Label | **Register** + tooltip |
| Modes | `none` · `you` · `other` · `custom` · `upload` |
| Pack depth | Durable `fewShotExamples` on report register |
| Edit behavior | Local override by default; explicit **Save to report** |
| You vs Other | Same pack pipeline / schema |
| Missing report | Disable mode; nudge “Generate report first” |
| Architecture | Approach 1 — draft field + prompt inject |

## Data model

```ts
interface RegisterFewShot {
  label: string
  postId?: string
  text: string
}

interface RegisterPack {
  description: string
  devices: string[]
  fewShotExamples: RegisterFewShot[]
}

type RegisterMode = 'none' | 'you' | 'other' | 'custom' | 'upload'

interface DraftRegister {
  mode: RegisterMode
  otherUsername?: string
  /** Local edits / custom / upload. null|undefined = use live report pack. */
  localPack?: RegisterPack | null
  /** Freeform when mode is custom (also used if pack serialization is text-first). */
  customPrompt?: string
}
```

- `PostDraft.register?: DraftRegister` — inherited from app default on `emptyDraft`.
- Compose store `registerDefault: { mode, otherUsername? }` — default `{ mode: 'you' }`.
- `ReportNarrative.register` gains `fewShotExamples` (same shape). Legacy reports without it treat as `[]`.

## Resolve at send time

1. `none` → no inject  
2. `you` / `other` → `localPack` if set, else live report pack; if no report, treat as unavailable (UI already disabled)  
3. `custom` → `customPrompt` and/or `localPack`  
4. `upload` → `localPack` from parsed file  

Inject as a clearly delimited block in the compose system or hot-user prefix so drafts match the pack’s cadence, devices, and few-shots.

## UI

Under “Who can reply”:

1. **Register** select (modes) + info tooltip  
2. **Other** → target picker (intel targets with a report only)  
3. Shared pack editor (description / devices / few-shots or custom textarea)  
4. Upload control when mode is `upload`  
5. **Make default** (writes `registerDefault`)  
6. **Save to report** when mode is `you`/`other` and `localPack` differs from live report  

## Report enrichment

On full report synthesis, extend register schema to include labeled few-shots. Prefer grounding `text` from real post bodies by `postId` after parse (never invent post text). If the model omits few-shots, backfill from `notablePosts` + high-density own posts.

## Out of scope (v1)

- Auto-rewrite on mode change  
- Thread-level register as source of truth  
- Visual dashboards / Feed sub-tab  
- Similarity scoring / regenerate loop  
