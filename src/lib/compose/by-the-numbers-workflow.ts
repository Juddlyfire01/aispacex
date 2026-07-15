/**
 * By the Numbers workflow — quantitative & rigorous complement to the Sphere Report.
 *
 * Deliberately INVERTS the Sphere Report's "no metrics in the body" rule. This
 * is a data story: the numbers ARE the deliverable. Built around a single metric
 * movement (burn acceleration, DIEM cliff tightening, staking shift, free-float
 * compression) with every figure sourced to VeniceStats. Same UX + phase-gate flow.
 */

import type { ComposeTemplateStarter } from './template-types'

export const BY_THE_NUMBERS_WORKFLOW_ID = 'by-the-numbers' as const

export const BY_THE_NUMBERS_LABEL = 'By the numbers'

export const BY_THE_NUMBERS_HINT = 'Metric-led data story, fully sourced'

/** User-bubble text: short launch line (no full prompt dump). */
export function buildByTheNumbersDisplayMessage(): string {
  return 'Generate a By the Numbers report'
}

/**
 * Multi-phase instruction for a metric-led data story:
 * 0) pick the metric with the biggest delta this week
 * 1) pull the series + context, sanity-check
 * 2) interpret: drivers, second-order effects, what it means
 * 3) compile the data-story longform (numbers in the body, all sourced)
 * 4) conclusion + falsifiers
 */
export function buildByTheNumbersPrompt(): string {
  return `Run the full By the Numbers workflow. This is a QUANTITATIVE data-story job built around one metric movement — NOT a broad narrative sweep.

CRITICAL — do not exit early:
- You MUST produce FULL Phase 1 and Phase 2 writeups IN CHAT before any draft tool call.
- Each research phase needs a dense brief in chat with the actual figures and sources. A one-line status is a failure.
- Do NOT call compose_write_draft until both research briefs are visible in this conversation.
- Work phases in order: Phase 0, then full Phase 1, then full Phase 2, then Phase 3 (write draft), then Phase 4 (conclusion in chat).
- The run is NOT complete until the Phase 4 conclusion has been posted after the draft.

SOURCING HARD RULE (mandatory):
- EVERY number must be attributed to VeniceStats and linked to the relevant venicestats.com page. No unsourced figures — an invented or unattributed number is a FAILED run.
- Do NOT give price predictions, targets, or buy/sell calls. Present the data and its mechanics; let the reader conclude.
- If the data is ambiguous or contradicts the framing, SAY SO. Honesty about the numbers over a clean story.

EVIDENCE SWEEP (gather your own evidence intelligently — do NOT wait to be fed data):
Gather the real series yourself, do not rely only on pre-loaded context. Reach for the right tools:
- Protocol / market / social (stats_*): stats_protocol, stats_market, stats_social — the PRIMARY source here. Pull the full picture around the chosen metric (levels, trend, related series).
- Local library (intel_*): intel_grep / intel_get_posts for how the sphere is talking about the metric (voices, framing) — as color, not as the number itself.
- Prior editions (compose_history_*): check whether this metric was already covered recently, to pick a fresh angle.
- Fresh framing (when enabled): news_read, x_news_search, web search for events that moved the number.
Report this to the user as ONE high-level overview line, NOT a per-tool log.

## Phase 0 — Metric selection (chat only — before Phase 1)
Identify the ONE metric with the most meaningful movement right now (candidates: burn acceleration, DIEM mintable-capacity / cliff, staking + lock ratio, free-float compression, DEX volume + buy/sell, discretionary burn cycle). State the metric, the rough delta, and why it matters this week. Then proceed.

## Phase 1 — The figures (chat only — no draft yet)
Pull and lay out the actual numbers IN CHAT, each attributed:
1. Current level + the change (day/week/period), with the VeniceStats source named and linked.
2. The relevant series / trend around it (what it was, what it is, slope).
3. Related metrics that corroborate or complicate the read.
4. A sanity check — do the figures line up across sources? Flag anything that doesn't.
End Phase 1, then IMMEDIATELY continue to Phase 2 (still chat only).

## Phase 2 — Interpretation (chat only — no draft yet)
Explain what the number MEANS, mechanically:
- Drivers: what is causing the movement (mechanism, not vibes).
- First- and second-order effects on the protocol / token economics.
- What would falsify or reverse the read — the honest counter-case.
Only after both Phase 1 and Phase 2 briefs exist in chat may you proceed.

## Phase 3 — Compile the data story (Draft drawer)
Call compose_write_draft ONCE with:
- format: longform (single Premium long-form tweet; longform:true; NOT an X Article)
- a dense brief: the headline figure, the supporting numbers, sources, and the interpretation arc
- register: rigorous data-story voice — the numbers ARE in the body here (this is the deliberate inverse of the Sphere Report). Lead with the figure, build the mechanism, land the meaning.
- MUST attribute every figure to VeniceStats with venicestats.com links. Include $cashtags where relevant. NO price targets or advice.
- If the data is thin or mixed, draft shorter and say so — do not manufacture precision.

After compose_write_draft: do NOT paste the full longform into chat. The Draft drawer holds the deliverable. Then continue to Phase 4.

## Phase 4 — Conclusion (chat only — after the draft is written)
Write a short sign-off IN CHAT (a few tight sentences — NOT another full report):
- The one-line read on the number (what it says right now).
- The key driver and the main second-order effect.
- What would change the picture (the falsifier to watch).
- One line pointing the user to the Draft drawer.
Keep it skimmable.

If evidence is thin, say what is missing rather than inventing metrics. End with: "Data compiled by VeniceStats (venicestats.com) through on-chain analysis. May contain inaccuracies — verify critical data independently."`
}

export const BY_THE_NUMBERS_STARTER: ComposeTemplateStarter = {
  id: BY_THE_NUMBERS_WORKFLOW_ID,
  label: BY_THE_NUMBERS_LABEL,
  hint: BY_THE_NUMBERS_HINT,
  blurb: 'let the numbers talk.',
  preferredFormat: 'longform',
  buildPrompt: () => buildByTheNumbersPrompt(),
  buildDisplayMessage: () => buildByTheNumbersDisplayMessage(),
}
