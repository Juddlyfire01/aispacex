# Compose Register Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Draft-drawer Register control that injects a rich voice pack into the next compose turn.

**Architecture:** Shared `RegisterPack` on intel reports + draft; resolve at send; UI under “Who can reply.”

**Tech Stack:** TypeScript, Zustand, Vitest, existing compose/intel modules.

---

### Task 1: Register pack types + resolve/format helpers

**Files:**
- Create: `src/lib/compose/register.ts`
- Create: `src/lib/compose/register.test.ts`
- Modify: `src/lib/x-intel/types.ts` (`ReportNarrative.register`)
- Modify: `src/lib/compose/types.ts` (`DraftRegister` on `PostDraft`, `emptyDraft`)

- [ ] Types + `emptyRegisterPack`, `normalizeRegisterPack`, `formatRegisterInject`, `resolveRegisterPack`
- [ ] Tests for format/resolve/normalize
- [ ] Extend report + draft types; `emptyDraft` accepts register default

### Task 2: Report synthesis few-shots + backfill

**Files:**
- Modify: `src/lib/x-intel/synthesize.ts` (REPORT_SYSTEM, `parseReport`)
- Create: `src/lib/x-intel/register-few-shots.ts` (+ test)
- Wire backfill after parse using own posts + notablePosts

### Task 3: Compose store default + draft inheritance

**Files:**
- Modify: `src/stores/compose-store.ts` (`registerDefault`, persist, `emptyDraft` on create/reset)
- Modify: `src/stores/compose-store.test.ts`

### Task 4: Prompt injection in use-compose

**Files:**
- Modify: `src/lib/compose/compose-prompt.ts` (+ test)
- Modify: `src/hooks/use-compose.ts` — resolve pack from self/target stores, inject

### Task 5: Draft drawer UI

**Files:**
- Create: `src/components/compose/register-controls.tsx`
- Modify: `src/components/compose/post-composer.tsx`
- Save-to-report writes pack onto latest self/target report snapshot

### Task 6: Upload parse + export shape

**Files:**
- In `register.ts`: `parseRegisterUpload(json)` 
- Tests for valid/invalid upload JSON

---

**Done when:** Unit tests pass; Register UI under Who can reply; next compose turn includes inject when mode ≠ none and pack available.
