/**
 * Signal Dossier workflow — deep & narrow complement to the Sphere Report.
 *
 * Where the Sphere Report maps the whole sphere (breadth), the Dossier goes
 * DEEP on ONE node — a single handle or a single emerging topic — tracing its
 * arc over time, posture, network, and trajectory. Same UX + phase-gate flow,
 * distinctly different output: a profile/biography, not a landscape map.
 */

import type { ComposeTemplateStarter } from './template-types'

export const SIGNAL_DOSSIER_WORKFLOW_ID = 'signal-dossier' as const

export const SIGNAL_DOSSIER_LABEL = 'Signal dossier'

export const SIGNAL_DOSSIER_HINT = 'Deep dive on one handle or topic'

/** User-bubble text: short launch line (no full prompt dump). */
export function buildSignalDossierDisplayMessage(): string {
  return 'Generate a Signal Dossier'
}

/**
 * Multi-phase instruction for a deep single-subject dossier:
 * 0) pick + justify the subject
 * 1) trace the arc (then vs now) with receipts
 * 2) network + posture (who they move with, how they're positioned)
 * 3) compile the dossier longform
 * 4) conclusion / what to watch from this node
 */
export function buildSignalDossierPrompt(): string {
  return `Run the full Signal Dossier workflow. This is a DEEP, single-subject research job — NOT a broad sphere scan.

CRITICAL — do not exit early:
- You MUST produce FULL Phase 1 and Phase 2 writeups IN CHAT before any draft tool call.
- Each research phase needs a dense brief in chat (hundreds of words) with receipts. A one-line status is a failure.
- Do NOT call compose_write_draft until both research briefs are visible in this conversation.
- Work phases in order: Phase 0, then full Phase 1, then full Phase 2, then Phase 3 (write draft), then Phase 4 (conclusion in chat).
- The run is NOT complete until the Phase 4 conclusion has been posted after the draft.

DEPTH HARD RULE (mandatory):
- This is a profile, not a snapshot. Success = the arc of ONE subject over time (then vs now), not a list of recent posts.
- Cover exactly one subject. If you find yourself mapping the whole sphere, you have failed — narrow back to the single node.
- A dossier that only restates this week's activity, with no evolution / trajectory, is a FAILED run.

EVIDENCE SWEEP (gather your own evidence intelligently — do NOT wait to be fed data):
Do not rely only on what is pre-loaded in the hot window. Gather intelligently: go deep on the one subject, follow its strongest threads, and stop when the arc is genuinely clear. Reach for the right tools:
- Local library (intel_*): intel_get_profile and intel_get_report for the subject's stored analysis, intel_get_posts / intel_grep / intel_glob for their originals and how their posture changed, intel_get_edges for who they move with.
- Prior editions (compose_history_*): recover any past coverage of this subject to avoid repeating it.
- Protocol / market / social (stats_*): only when the subject's claims or influence need quantifying.
- Fresh framing (when enabled): news_read, x_news_search / x_news_get, web search for recent developments involving the subject.
Report this to the user as ONE high-level overview line, NOT a per-tool log.

## Phase 0 — Subject selection (chat only — before Phase 1)
Pick the ONE subject this dossier covers (a handle, or a single emerging topic). If the user named one, use it. Otherwise choose the highest-signal node right now and justify the pick in 2–3 lines: why this subject, why now. Output the subject + rationale, then proceed.

## Phase 1 — The arc (chat only — no draft yet)
Trace the subject's evolution with receipts:
1. Who / what it is and why it matters in the sphere right now.
2. THEN vs NOW: earlier positions/behaviour vs current, with dated receipts (post ids / handles / urls). The delta IS the story.
3. Signature themes, recurring arguments, tone/posture shifts.
4. Credibility / influence texture — reach, who amplifies them, track record.
End Phase 1, then IMMEDIATELY continue to Phase 2 (still chat only).

## Phase 2 — Network & positioning (chat only — no draft yet)
Map how the subject sits in the wider sphere:
- Who they move with / against (allies, foils, counters) — use intel_get_edges and receipts.
- Where they sit on the live tensions (privacy moat, Plan L vs Plan D, product vs token, etc.).
- What their trajectory implies — where this node is heading and what would change it.
Only after both Phase 1 and Phase 2 briefs exist in chat may you proceed.

## Phase 3 — Compile the dossier (Draft drawer)
Call compose_write_draft ONCE with:
- format: longform (single Premium long-form tweet; longform:true; NOT an X Article)
- a dense brief: section outline, must-include receipts, handles, post ids as https://x.com/i/status/{id}, urls where known
- register: analytical profile voice — explanatory, receipt-dense, fair (not a hit piece, not a puff piece)
- structure: open on why-this-subject-now → the arc (then vs now) → network & positioning → trajectory / what to watch
- MUST center the evolution delta; a static snapshot in the body is a failed draft. If evidence is thin, draft shorter and label gaps — do not invent.

After compose_write_draft: do NOT paste the full longform into chat. The Draft drawer holds the deliverable. Then continue to Phase 4.

## Phase 4 — Conclusion (chat only — after the draft is written)
Write a short sign-off IN CHAT (a few tight sentences — NOT another full dossier):
- The one-line read on this subject (who they are becoming).
- 2–3 highest-signal takeaways.
- Open questions / what to watch next from this node.
- One line pointing the user to the Draft drawer.
Keep it skimmable.

If evidence is thin, say what is missing rather than inventing posts, metrics, or quotes.`
}

export const SIGNAL_DOSSIER_STARTER: ComposeTemplateStarter = {
  id: SIGNAL_DOSSIER_WORKFLOW_ID,
  label: SIGNAL_DOSSIER_LABEL,
  hint: SIGNAL_DOSSIER_HINT,
  blurb: 'go deep on one node.',
  preferredFormat: 'longform',
  buildPrompt: () => buildSignalDossierPrompt(),
  buildDisplayMessage: () => buildSignalDossierDisplayMessage(),
}
