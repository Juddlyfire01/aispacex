/**
 * Rebuttal Brief workflow — adversarial & persuasive complement to the Sphere Report.
 *
 * Takes ONE bear thesis / FUD line / criticism (pasted by the user, or the
 * loudest counter auto-detected in the sphere) and builds a receipts-backed
 * response. Where the Sphere Report describes the battlefield, this wins one
 * specific fight. Same UX + phase-gate flow; output is a targeted reply/thread.
 */

import type { ComposeTemplateStarter } from './template-types'

export const REBUTTAL_BRIEF_WORKFLOW_ID = 'rebuttal-brief' as const

export const REBUTTAL_BRIEF_LABEL = 'Rebuttal brief'

export const REBUTTAL_BRIEF_HINT = 'Steelman then counter one bear claim'

/** User-bubble text: short launch line (no full prompt dump). */
export function buildRebuttalBriefDisplayMessage(): string {
  return 'Generate a Rebuttal Brief'
}

/**
 * Multi-phase instruction for an adversarial rebuttal:
 * 0) identify + quote the claim
 * 1) steelman it honestly (strongest version + where it's right)
 * 2) gather counter-receipts
 * 3) compile the rebuttal draft
 * 4) conclusion + residual weak points
 */
export function buildRebuttalBriefPrompt(): string {
  return `Run the full Rebuttal Brief workflow. This is an ADVERSARIAL, single-claim job — NOT a broad sphere scan.

CRITICAL — do not exit early:
- You MUST produce FULL Phase 1 (steelman) and Phase 2 (counter-evidence) writeups IN CHAT before any draft tool call.
- Each research phase needs a dense brief in chat with receipts. A one-line status is a failure.
- Do NOT call compose_write_draft until both research briefs are visible in this conversation.
- Work phases in order: Phase 0, then full Phase 1, then full Phase 2, then Phase 3 (write draft), then Phase 4 (conclusion in chat).
- The run is NOT complete until the Phase 4 conclusion has been posted after the draft.

STEELMAN HARD RULE (mandatory):
- You MUST steelman the claim in Phase 1 BEFORE rebutting it. Strawmanning — attacking a weak version of the argument — is a FAILED run.
- Concede what is actually true in the claim. A rebuttal that pretends the bear case has zero merit is not credible and is a FAILED run.
- Rebut with receipts and mechanics, not vibes or ad hominem. Attack the argument, never the person.
- No price predictions, targets, or buy/sell calls.

EVIDENCE SWEEP (gather your own evidence intelligently — do NOT wait to be fed data):
Gather both sides yourself, do not rely only on pre-loaded context. Reach for the right tools:
- Local library (intel_*): intel_grep / intel_get_posts to find how the claim is being argued (both the critics and the defenders), intel_get_report / intel_get_profile for the voices involved.
- Protocol / market / social (stats_*): stats_protocol, stats_market, stats_social for hard counter-evidence (or evidence the claim is partly right).
- Prior editions (compose_history_*): check whether this claim was already answered, to avoid repeating.
- Fresh framing (when enabled): news_read, x_news_search, web search for the latest on the disputed point.
Report this to the user as ONE high-level overview line, NOT a per-tool log.

## Phase 0 — Identify the claim (chat only — before Phase 1)
Pin down the ONE claim this brief answers. If the user pasted a claim / post / FUD line, use it verbatim (quote it + link the post id if given). Otherwise, find the loudest current bear thesis / criticism in the sphere and quote it with its receipt. State the single claim in one sentence, then proceed.

## Phase 1 — Steelman (chat only — no draft yet)
Build the STRONGEST honest version of the claim:
1. Restate the argument charitably, in its most compelling form.
2. The real evidence behind it (receipts — post ids / handles / stats / urls).
3. What is genuinely TRUE or fair in it — concede this explicitly.
End Phase 1, then IMMEDIATELY continue to Phase 2 (still chat only).

## Phase 2 — Counter-evidence (chat only — no draft yet)
Assemble the rebuttal:
- Where the claim is wrong, overstated, or missing context — each point backed by a receipt or a mechanism.
- The stronger counter-thesis, built from evidence.
- The honest residual: what the claim still gets right that your rebuttal does NOT erase.
Only after both Phase 1 and Phase 2 briefs exist in chat may you proceed.

## Phase 3 — Compile the rebuttal (Draft drawer)
Call compose_write_draft ONCE with:
- format: longform by default (single Premium long-form tweet; longform:true; NOT an X Article) — or a short thread if the user asked for a reply. Never an X Article.
- a dense brief: the quoted claim, the concession, the counter-points with receipts, the close
- register: sharp, fair, persuasive — concede-then-counter structure. @handles, $cashtags, post ids as https://x.com/i/status/{id}, urls where known.
- MUST open by fairly representing the claim (the steelman in miniature) before countering. No strawman, no ad hominem, no price advice.

After compose_write_draft: do NOT paste the full draft into chat. The Draft drawer holds the deliverable. Then continue to Phase 4.

## Phase 4 — Conclusion (chat only — after the draft is written)
Write a short sign-off IN CHAT (a few tight sentences — NOT another full brief):
- The one-line verdict (what the rebuttal establishes).
- The strongest counter-point and the concession you kept.
- Residual weak points — where NOT to overclaim if challenged.
- One line pointing the user to the Draft drawer.
Keep it skimmable.

If evidence is thin, say what is missing rather than inventing posts, metrics, or quotes.`
}

export const REBUTTAL_BRIEF_STARTER: ComposeTemplateStarter = {
  id: REBUTTAL_BRIEF_WORKFLOW_ID,
  label: REBUTTAL_BRIEF_LABEL,
  hint: REBUTTAL_BRIEF_HINT,
  blurb: 'answer the loudest bear.',
  preferredFormat: 'longform',
  buildPrompt: () => buildRebuttalBriefPrompt(),
  buildDisplayMessage: () => buildRebuttalBriefDisplayMessage(),
}
