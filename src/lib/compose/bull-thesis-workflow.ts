/**
 * Bull Thesis workflow — conviction & forward-looking complement to the Sphere Report.
 *
 * Builds the strongest positive case for Venice / $VVV / DIEM. Where the Sphere
 * Report describes WHAT IS (neutral, present-tense), this argues WHY IT WINS
 * (positional, forward-looking) — a compounding thesis chain that rallies the
 * sphere. Same UX + phase-gate flow; output is a persuasive longform.
 *
 * Hard constraint: built on FUNDAMENTALS (product, adoption, tokenomics, moat),
 * never price direction, targets, or buy calls.
 */

import type { ComposeTemplateStarter } from './template-types'

export const BULL_THESIS_WORKFLOW_ID = 'bull-thesis' as const

export const BULL_THESIS_LABEL = 'Bull thesis'

export const BULL_THESIS_HINT = 'Compounding positive case, fundamentals only'

/** User-bubble text: short launch line (no full prompt dump). */
export function buildBullThesisDisplayMessage(): string {
  return 'Generate a Bull Thesis'
}

/**
 * Multi-phase instruction for a forward-looking bull thesis:
 * 0) frame the thesis spine
 * 1) gather the strongest fundamental signals
 * 2) chain them into first/second/third-order compounding logic
 * 3) compile the thesis longform
 * 4) conclusion + honest risk footnote
 */
export function buildBullThesisPrompt(): string {
  return `Run the full Bull Thesis workflow. This is a CONVICTION, forward-looking argument — NOT a neutral sphere map.

CRITICAL — do not exit early:
- You MUST produce FULL Phase 1 and Phase 2 writeups IN CHAT before any draft tool call.
- Each research phase needs a dense brief in chat with receipts. A one-line status is a failure.
- Do NOT call compose_write_draft until both research briefs are visible in this conversation.
- Work phases in order: Phase 0, then full Phase 1, then full Phase 2, then Phase 3 (write draft), then Phase 4 (conclusion in chat).
- The run is NOT complete until the Phase 4 conclusion has been posted after the draft.

FUNDAMENTALS HARD RULE (mandatory — most important for this template):
- The thesis MUST be built on fundamentals: product velocity, adoption/usage, tokenomics (burns, DIEM mint/sink, supply), moat (privacy, uncensored, owned compute). 
- NO price direction, price targets, "number go up", or buy/sell calls. A price-pump framing is a FAILED run. Amplify WHY IT IS STRONG, not what the price will do.
- This is proactive conviction, NOT a response to a specific critic (that is the Rebuttal Brief). Build the positive case on its own terms.
- Distinct from the Sphere Report: take a POSITION and compound it, do not stay neutral. But every claim still needs a receipt — conviction is not invention.

EVIDENCE SWEEP (gather your own evidence intelligently — do NOT wait to be fed data):
Gather the strongest real signals yourself, do not rely only on pre-loaded context. Reach for the right tools:
- Protocol / market / social (stats_*): stats_protocol, stats_market, stats_social for the fundamental mechanics (burns, staking, DIEM, free float) — as evidence of strength, not as price forecasting.
- Local library (intel_*): intel_grep / intel_get_posts / intel_get_report for product ships, adoption receipts, credible bull voices and their arguments.
- Prior editions (compose_history_*): check what's already been argued so the thesis advances rather than repeats.
- Fresh framing (when enabled): news_read, x_news_search, web search for new ships / adoption / macro tailwinds.
Report this to the user as ONE high-level overview line, NOT a per-tool log.

## Phase 0 — Thesis spine (chat only — before Phase 1)
State the core thesis in 1–2 sentences (why Venice / $VVV / DIEM wins on fundamentals). Name the 3–4 pillars you will build on (e.g. privacy moat, owned-compute economics, burn/supply mechanics, agentic demand). Then proceed.

## Phase 1 — The strongest signals (chat only — no draft yet)
Gather the best fundamental evidence, with receipts:
1. Product & adoption: recent ships, usage heat, integrations, power-user pull (post ids / handles / urls).
2. Tokenomics: burns vs emissions, DIEM mint/sink, supply / free-float mechanics (stats_* sourced + linked). Mechanics, not targets.
3. Moat: privacy / uncensored / owned-compute advantages competitors cannot easily copy.
4. Credible bull voices and the strongest version of their argument.
End Phase 1, then IMMEDIATELY continue to Phase 2 (still chat only).

## Phase 2 — The compounding chain (chat only — no draft yet)
Assemble the signals into a THESIS CHAIN where each point reinforces the next:
- First-order: what is true now.
- Second-order: what that causes (flywheels, demand, margin, scarcity).
- Third-order: where it compounds if it continues.
Make the logic stack — this is the difference between a list and a thesis. Note the key assumptions each link depends on.
Only after both Phase 1 and Phase 2 briefs exist in chat may you proceed.

## Phase 3 — Compile the thesis (Draft drawer)
Call compose_write_draft ONCE with:
- format: longform (single Premium long-form tweet; longform:true; NOT an X Article)
- a dense brief: the thesis spine, the pillars with receipts, the compounding chain, the close
- register: high-conviction, forward-looking, persuasive — a compounding argument, not a metrics dump and not a neutral map. @handles, $cashtags (e.g. $VVV), post ids as https://x.com/i/status/{id}, urls where known.
- FUNDAMENTALS ONLY. No price targets, no advice. If a link in the chain is weak, soften it honestly rather than overclaiming.

After compose_write_draft: do NOT paste the full longform into chat. The Draft drawer holds the deliverable. Then continue to Phase 4.

## Phase 4 — Conclusion (chat only — after the draft is written)
Write a short sign-off IN CHAT (a few tight sentences — NOT another full thesis):
- The thesis in one line.
- The strongest pillar and the key compounding effect.
- HONEST RISK FOOTNOTE: what would break the thesis (the main assumption / threat). This is required — a bull case with no stated risk is incomplete.
- One line pointing the user to the Draft drawer.
Keep it skimmable.

If evidence is thin, say what is missing rather than inventing posts, metrics, or quotes.`
}

export const BULL_THESIS_STARTER: ComposeTemplateStarter = {
  id: BULL_THESIS_WORKFLOW_ID,
  label: BULL_THESIS_LABEL,
  hint: BULL_THESIS_HINT,
  blurb: 'make the case for the upside.',
  preferredFormat: 'longform',
  buildPrompt: () => buildBullThesisPrompt(),
  buildDisplayMessage: () => buildBullThesisDisplayMessage(),
}
