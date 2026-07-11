# Report Toast Pre-Stream Stages Design

**Date:** 2026-07-11  
**Status:** Approved (Approach A — timer theater in `report-progress`)

## Goal

Break up the dead air before the first SSE chunk when generating an X-intel report by showing three short, accurate pre-stream stage labels as **display holds** (not work gates).

## Locked decisions

| Decision | Choice |
|----------|--------|
| Hold vs gate | Display holds only — analytics + Venice request run immediately underneath |
| Labels | `Computing…` → `Sending…` → `Waiting…` (short form) |
| Computing hold | 1s from `markPrepare` |
| Sending hold | 2s after Computing advances |
| Waiting | Until first streamed completion token (SSE content delta) |
| Ownership | Timers + labels inside `beginReportProgress` (`report-progress.ts`) |
| Early first chunk | Cancel remaining holds; jump straight to writing-phase labels |
| Existing stages | Unchanged after first chunk: Writing narrative… / Summarizing changes… + ~% |

## Current behavior (baseline)

1. Toast opens with a Preparing teaser label.
2. `markPrepare` → `Computing analytics…` (often only a frame).
3. `markPhase` → Writing / Summarizing immediately when synthesize starts the call (before first token).
4. `onStreamTokens` updates ~% as deltas arrive.

## Target behavior

1. `beginReportProgress` + `markPrepare` show **Computing…** and start the hold schedule.
2. After **1s** (if still pre-stream): **Sending…**
3. After **2s more** (if still pre-stream): **Waiting…**
4. On **first** `onStreamTokens` call: clear timers; switch to existing phase labels + progress mapping.
5. `markPhase` arms the active phase for labeling but **does not** override pre-stream holds until the first token (or is a no-op for labels while holds are active).
6. `complete` / `fail`: clear any pending timers.

## Progress bar

Keep monotonic bar. Small nudges during pre-stream (e.g. ~0.03 → 0.04 Computing → 0.05 Sending → 0.06 Waiting), then existing `mapReportStreamProgress` from first token onward. Completing early still snaps full via `toast.complete`.

## Out of scope

- Changing synthesize / Venice request timing
- New toast UI chrome (spinner variants, multi-step stepper component)
- Compose or other non-report progress toasts

## Testing

Unit-test `beginReportProgress` with fake timers: label sequence at 0 / 1s / 3s; first-token cancel skips remaining holds; fail clears timers.
