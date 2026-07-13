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

/**
 * Multi-phase instruction that recreates the proven exchange pattern:
 * 1) sphere pulse + clusters + voices
 * 2) thematically linked outside currents
 * 3) compile into informational longform with handles, cashtags, post ids, urls
 */
export function buildSphereReportPrompt(opts?: {
  /** When true, ask for a metrics-light informational register (default for final draft). */
  informationalRegister?: boolean
}): string {
  const informational = opts?.informationalRegister !== false

  return `Run the full Sphere Report workflow end-to-end. Work in phases; do not skip research before drafting.

## Phase 1 — What's trending in my sphere?
Map the live pulse of the Venice / $VVV / DIEM sphere using:
- Hot window + intel_* tools for local library receipts
- stats_* (VeniceStats) for protocol/market/social pulse when relevant
- Live X/web/X News search when enabled and needed for fresher framing

Produce a dense analytical brief covering:
1. Live snapshot (prices, stake, burns, DIEM capacity, free float, volume — via VeniceStats; name the source and link venicestats.com pages in chat)
2. Core trending clusters (3–6), each with texture + post ids / handles as evidence
3. Key voices & posture (bulls, product pressure, counters/FUD)
4. Social buzz texture when available
5. First- and second-order effects + risk surface
6. Bottom line (execute/defend/cliff heat style — data only, no price advice)

End Phase 1 with a short offer of deeper dives, then continue.

## Phase 2 — Outside the sphere, same themes
Research what is trending *outside* Venice but tightly linked to the same themes:
- Local / open-weight hardware sovereignty (Plan L energy)
- Surveillance infrastructure & privacy backlash
- Agentic tooling & long-horizon autonomy
- Hardware ambition & intentional / analog interfaces
- Own-the-stack / privacy-as-luxury framing

For each cluster: concrete named examples, receipts (handles, post ids, urls when known), and the explicit link back to sphere theses (privacy moat, uncensored multi-turn agents, owned compute economics, Plan L vs Plan D).

Cover first-/second-order effects and the tension surface (pure local vs hybrid private capacity). Bottom line on the non-Venice currents.

## Phase 3 — Compile longform draft
After Phases 1–2 are grounded in tools/evidence, call compose_write_draft once with:
- format: longform (single Premium long-form tweet; longform:true; NOT an X Article)
- dense brief that includes section outline, must-include facts, handles, post ids, cashtags, and permalink style for citations
- must include in the draft body: @handles, $cashtags (e.g. $VVV), post ids rewritten as https://x.com/i/status/{id}, and real urls where known
- explorative, informative longform — not a thread, not a short post
${
  informational
    ? `- register: informational report voice — clear structure, explanatory, receipt-dense
- NO Venice protocol metrics dump in the draft body (no price/mcap/stake/APR/burn tables). Metrics may stay in chat Phase 1 only. The draft maps narratives, voices, outside currents, and first-/second-order effects without a stats block.
- Still allow thematic mentions of DIEM cliff, burns, private models, Plan D, etc. as *story*, not as a metrics table.`
    : `- register: dense stats + sphere heat allowed in the draft when it strengthens the piece`
}

Do NOT paste the full longform into chat — the Draft drawer is the deliverable. After the tool, one short status line only.

If evidence is thin, say what is missing rather than inventing posts, metrics, or quotes.`
}

/** Empty-state starter entry for Compose. */
export const SPHERE_REPORT_STARTER = {
  id: SPHERE_REPORT_WORKFLOW_ID,
  label: SPHERE_REPORT_LABEL,
  hint: SPHERE_REPORT_HINT,
  /** Preferred format forced when launching this workflow. */
  preferredFormat: 'longform' as const,
  buildPrompt: () => buildSphereReportPrompt({ informationalRegister: true }),
}
