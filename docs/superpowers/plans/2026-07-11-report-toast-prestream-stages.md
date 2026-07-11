# Report Toast Pre-Stream Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Computing… (1s) → Sending… (2s) → Waiting… (until first SSE) as display holds on the generate-report toast before existing writing-phase labels.

**Architecture:** Timer theater lives entirely in `beginReportProgress` (`src/lib/x-intel/report-progress.ts`). Orchestrate/synthesize keep calling `markPrepare` / `markPhase` / `onStreamTokens` as today; `markPhase` only arms the active phase while pre-stream holds run; first `onStreamTokens` clears timers and switches to writing labels.

**Tech Stack:** TypeScript, Vitest fake timers, existing Zustand toast store.

**Spec:** `docs/superpowers/specs/2026-07-11-report-toast-prestream-stages-design.md`

---

## File map

| File | Role |
|------|------|
| `src/lib/x-intel/report-progress.ts` | Hold schedule, labels, timer cleanup |
| `src/lib/x-intel/report-progress.test.ts` | Fake-timer unit tests (new) |
| `src/lib/x-intel/orchestrate.ts` | No logic change (already calls markPrepare / markPhase / onStreamTokens) |
| `src/lib/x-intel/self-orchestrate.ts` | Same — no logic change |

---

### Task 1: Failing tests for pre-stream hold sequence

**Files:**
- Create: `src/lib/x-intel/report-progress.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast, useToastStore } from '../../stores/toast-store'
import { beginReportProgress } from './report-progress'

function labelOf(id: number): string | undefined {
  return useToastStore.getState().toasts.find((t) => t.id === id)?.progressLabel
}

describe('beginReportProgress pre-stream holds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
    useToastStore.setState({ toasts: [] })
  })

  it('advances Computing → Sending → Waiting on the hold schedule', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    expect(labelOf(p.toastId)).toBe('Computing…')

    vi.advanceTimersByTime(999)
    expect(labelOf(p.toastId)).toBe('Computing…')
    vi.advanceTimersByTime(1)
    expect(labelOf(p.toastId)).toBe('Sending…')

    vi.advanceTimersByTime(1999)
    expect(labelOf(p.toastId)).toBe('Sending…')
    vi.advanceTimersByTime(1)
    expect(labelOf(p.toastId)).toBe('Waiting…')
  })

  it('first stream token cancels remaining holds and shows writing label', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    p.markPhase('narrative')
    expect(labelOf(p.toastId)).toBe('Computing…')

    vi.advanceTimersByTime(1000)
    expect(labelOf(p.toastId)).toBe('Sending…')

    p.onStreamTokens('narrative', 10, 1000)
    expect(labelOf(p.toastId)).toMatch(/Writing narrative/)

    vi.advanceTimersByTime(5000)
    expect(labelOf(p.toastId)).toMatch(/Writing narrative/)
  })

  it('fail clears timers so later ticks do not revive the toast label', () => {
    const p = beginReportProgress({ subject: '@alice', hasChangeStep: false })
    p.markPrepare()
    p.fail('Report failed', 'boom')
    vi.advanceTimersByTime(5000)
    const t = useToastStore.getState().toasts.find((x) => x.id === p.toastId)
    expect(t?.variant).toBe('error')
    expect(t?.progressLabel).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/lib/x-intel/report-progress.test.ts
```

Expected: FAIL (labels still `Computing analytics…` / immediate writing, no hold schedule).

---

### Task 2: Implement hold schedule in `report-progress.ts`

**Files:**
- Modify: `src/lib/x-intel/report-progress.ts`

- [ ] **Step 1: Implement**

Replace pre-stream behavior in `beginReportProgress`:

Constants:
- `PRESTREAM_COMPUTING_MS = 1000`
- `PRESTREAM_SENDING_MS = 2000`
- Progress nudges: Computing `0.04`, Sending `0.05`, Waiting `0.06`

Behavior:
1. Initial toast `progressLabel`: `Computing…`, `progress: 0.03` (or set fully in `markPrepare`).
2. `markPrepare`: set Computing… @ 0.04; schedule Sending at +1s; from that tick schedule Waiting at +2s. Track timer ids; `clearPrestream()` clears them and sets a `streamingStarted` flag.
3. `markPhase`: store `activePhase`; if `!streamingStarted`, do **not** change `progressLabel` (holds own the label).
4. `onStreamTokens`: if `!streamingStarted`, call `clearPrestream()` then apply existing writing-label + `mapReportStreamProgress` logic.
5. `complete` / `fail`: call `clearPrestream()` then existing toast.complete/fail.

Keep `phaseLabel`, `onStreamTokens` % formatting, and `hasChangeStep` step copy as today once streaming has started.

- [ ] **Step 2: Run tests — expect PASS**

```bash
npx vitest run src/lib/x-intel/report-progress.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/x-intel/report-progress.ts src/lib/x-intel/report-progress.test.ts
git commit -m "feat(x-intel): add Computing/Sending/Waiting report toast holds"
```

---

### Task 3: Smoke existing toast + report paths

**Files:** none (verification only)

- [ ] **Step 1: Run related tests**

```bash
npx vitest run src/stores/toast-store.test.ts src/lib/x-intel/report-progress.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Manual check (optional)** — Generate a report; toast should show Computing… → Sending… → Waiting… then Writing narrative… ~N%.

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Computing 1s hold | 1–2 |
| Sending 2s hold | 1–2 |
| Waiting until first SSE | 1–2 (`onStreamTokens`) |
| Display holds not gates | 2 (timers only; no sleeps in orchestrate) |
| Early chunk cancels holds | 1–2 |
| complete/fail clears timers | 1–2 |
| Existing writing stages unchanged after first chunk | 2 |
