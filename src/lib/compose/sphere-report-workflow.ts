/**
 * Sphere Report workflow — multi-step research → longform draft pattern
 * used for "what's trending in my sphere" intel briefs.
 *
 * Seeded as a single user turn so the compose agent researches in chat,
 * then calls compose_write_draft for the publishable longform.
 */

export const SPHERE_REPORT_WORKFLOW_ID = 'sphere-report' as const

export const SPHERE_REPORT_LABEL = 'Sphere report'

export const SPHERE_REPORT_HINT =
  'Trending intel → outside themes → longform report'

/** Longform section headings — Sphere vernacular (exact labels). */
export const SPHERE_SECTION_CENTER = 'Central'
export const SPHERE_SECTION_CLUSTERS = 'Clusters'
export const SPHERE_SECTION_ORBIT = 'Related'

/**
 * What the user sees in chat when the template launches (not the full agent brief).
 * Full instructions still go to the model via `buildPrompt()`.
 */
export const SPHERE_REPORT_PROCESS = [
  `1. ${SPHERE_SECTION_CENTER} — sphere pulse, clusters, and voices (research in chat)`,
  `2. ${SPHERE_SECTION_ORBIT} — outside themes linked to the same theses (research in chat)`,
  `3. Longform — compile into the Draft drawer (${SPHERE_SECTION_CENTER} / ${SPHERE_SECTION_CLUSTERS} / ${SPHERE_SECTION_ORBIT})`,
].join('\n')

/** User-bubble text: template name + process (no full prompt dump). */
export function buildSphereReportDisplayMessage(): string {
  return `${SPHERE_REPORT_LABEL}\n\n${SPHERE_REPORT_PROCESS}`
}

/**
 * Multi-phase instruction that recreates the proven exchange pattern:
 * 1) sphere pulse + clusters + voices (full chat brief)
 * 2) thematically linked outside currents (full chat brief)
 * 3) compile into informational longform with sphere section vernacular
 */
export function buildSphereReportPrompt(opts?: {
  /** When true, ask for a metrics-light informational register (default for final draft). */
  informationalRegister?: boolean
}): string {
  const informational = opts?.informationalRegister !== false

  return `Run the full Sphere Report workflow. This is a multi-phase research job — NOT a one-shot draft.

CRITICAL — do not exit early:
- You MUST produce FULL Phase 1 and FULL Phase 2 writeups IN CHAT before any draft tool call.
- A one-line status ("Phase 1–2 done…") is a failure. Each research phase needs a dense multi-section brief in chat (hundreds of words), with receipts.
- Do NOT call compose_write_draft until both research briefs are already visible in this conversation as assistant messages.
- Work phases in order. Finish Phase 1 chat output completely, then Phase 2 chat output completely, then Phase 3.

## Phase 1 — Central (chat only — no draft yet)
Map the live pulse of the Venice / $VVV / DIEM sphere using:
- Hot window + intel_* tools for local library receipts
- stats_* (VeniceStats) for protocol/market/social pulse when relevant
- Live X/web/X News search when enabled and needed for fresher framing

Write a dense analytical brief IN CHAT covering all of:
1. Live snapshot (prices, stake, burns, DIEM capacity, free float, volume — via VeniceStats; name the source and link venicestats.com pages)
2. Core trending clusters (3–6), each with texture + post ids / handles as evidence
3. Key voices & posture (bulls, product pressure, counters/FUD)
4. Social buzz texture when available
5. First- and second-order effects + risk surface
6. Bottom line (execute/defend/cliff heat style — data only, no price advice)

End Phase 1 with a short offer of deeper dives, then IMMEDIATELY continue to Phase 2 in the same turn sequence (still chat only).

## Phase 2 — Related (chat only — no draft yet)
Research what is trending *outside* Venice but tightly linked to the same themes:
- Local / open-weight hardware sovereignty (Plan L energy)
- Surveillance infrastructure & privacy backlash
- Agentic tooling & long-horizon autonomy
- Hardware ambition & intentional / analog interfaces
- Own-the-stack / privacy-as-luxury framing

Write a second dense brief IN CHAT. For each cluster: concrete named examples, receipts (handles, post ids, urls when known), and the explicit link back to sphere theses (privacy moat, uncensored multi-turn agents, owned compute economics, Plan L vs Plan D).

Cover first-/second-order effects and the tension surface (pure local vs hybrid private capacity). Bottom line on the non-Venice currents.

Only after both Phase 1 and Phase 2 briefs exist in chat may you proceed.

## Phase 3 — Compile longform draft (Draft drawer)
Call compose_write_draft ONCE with:
- format: longform (single Premium long-form tweet; longform:true; NOT an X Article)
- dense brief that includes section outline, must-include facts, handles, post ids, cashtags, and permalink style for citations
- must include in the draft body: @handles, $cashtags (e.g. $VVV), post ids rewritten as https://x.com/i/status/{id}, and real urls where known
- explorative, informative longform — not a thread, not a short post

SPHERE VERNACULAR — structure the longform with these exact section headings (in this order):
1. ${SPHERE_SECTION_CENTER} — core sphere thesis / pulse / stakes (narrative, not a metrics table when informational)
2. ${SPHERE_SECTION_CLUSTERS} — inside-sphere trending clusters, voices, receipts
3. ${SPHERE_SECTION_ORBIT} — outside-but-linked currents that reinforce the same themes

You may use short open/close framing, but those three headings are required and must appear exactly as written: Central, Clusters, Related.
${
  informational
    ? `
Register for the draft: informational report voice — clear structure, explanatory, receipt-dense.
- NO Venice protocol metrics dump in the draft body (no price/mcap/stake/APR/burn tables). Metrics stay in Phase 1 chat only. The draft maps narratives, voices, outside currents, and first-/second-order effects without a stats block.
- Still allow thematic mentions of DIEM cliff, burns, private models, Plan D, etc. as *story*, not as a metrics table.`
    : `
Register for the draft: dense stats + sphere heat allowed when it strengthens the piece.`
}

After compose_write_draft: one short status line in chat only — do NOT paste the full longform into chat. The Draft drawer is the deliverable.

If evidence is thin, say what is missing rather than inventing posts, metrics, or quotes.`
}

/** Empty-state starter entry for Compose. */
export const SPHERE_REPORT_STARTER = {
  id: SPHERE_REPORT_WORKFLOW_ID,
  label: SPHERE_REPORT_LABEL,
  hint: SPHERE_REPORT_HINT,
  /** Preferred format forced when launching this workflow. */
  preferredFormat: 'longform' as const,
  /** Full multi-phase instructions for the model (not shown in chat). */
  buildPrompt: () => buildSphereReportPrompt({ informationalRegister: true }),
  /** Short label + process steps shown in the user bubble. */
  buildDisplayMessage: () => buildSphereReportDisplayMessage(),
}
