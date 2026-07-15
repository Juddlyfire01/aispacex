/**
 * Sphere Report workflow — multi-step research → longform draft pattern
 * used for "what's trending in my sphere" intel briefs.
 *
 * Seeded as a single user turn so the compose agent researches in chat,
 * then calls compose_write_draft for the publishable longform.
 */

export const SPHERE_REPORT_WORKFLOW_ID = 'sphere-report' as const

export const SPHERE_REPORT_LABEL = 'Sphere report'

export const SPHERE_REPORT_HINT = 'Delta pulse → outside themes → longform'

/** Longform section headings — Sphere vernacular (exact labels). */
export const SPHERE_SECTION_CENTER = 'Central'
export const SPHERE_SECTION_CLUSTERS = 'Clusters'
export const SPHERE_SECTION_ORBIT = 'Related'

/**
 * What the user sees in chat when the template launches (not the full agent brief).
 * Full instructions still go to the model via `buildPrompt()`.
 */
/** User-bubble text: short launch line (no full prompt dump). */
export function buildSphereReportDisplayMessage(): string {
  return 'Generate the Sphere Report'
}

/**
 * Multi-phase instruction that recreates the proven exchange pattern:
 * 0) prior-art & novelty gate (short chat brief)
 * 1) sphere pulse + clusters + voices (full chat brief)
 * 2) thematically linked outside currents (full chat brief)
 * 3) compile into informational longform with sphere section vernacular
 * 4) conclusion / sign-off in chat after the draft is written
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
- Work phases in order: Phase 0, then full Phase 1, then full Phase 2, then Phase 3 (write draft), then Phase 4 (conclusion in chat).
- The run is NOT complete until the Phase 4 conclusion has been posted in chat after the draft.

NOVELTY HARD RULE (mandatory):
- A Sphere Report that is structurally or exhibit-wise a remix of the most recent @aispace_bot sphere / dual-map post is a FAILED run.
- This is a periodic delta brief, not a static landscape map. Success = NEW ideas + NEW receipts since the last edition. Cite the prior map only as a baseline to move past.
- If the user links a post mid-run and says "too similar," treat that post id as PRIOR ART immediately: re-open Phase 0, rebuild the forbidden-reuse list, and do NOT draft until Phases 1–2 are rewritten around the delta.

EVIDENCE SWEEP (gather your own evidence intelligently — do NOT wait to be fed data):
Do not rely only on what is pre-loaded in the hot window. You have the tools and the library, so go get what the report actually needs. This is NOT a rote checklist to run end-to-end every time — gather intelligently: start from the delta hunt, follow the strongest leads, pull more where signal is live, and stop when coverage is genuinely sufficient. A report that is thin because you leaned only on pre-loaded context is a FAILED run; an over-padded dump of every tool is also wrong.
- Judge what's needed per run, then reach for the right tools:
  - Local library (intel_*): intel_list_subjects to see what's in scope, then intel_get_posts / intel_grep / intel_glob, intel_get_report, intel_get_profile, intel_get_edges for the handles and threads that matter this edition.
  - Prior editions (compose_history_*): recover past sphere reports / dual maps for the prior-art baseline.
  - Protocol / market / social (stats_*): stats_protocol, stats_market, stats_social when the snapshot or a claim needs them.
  - Fresh framing (when enabled): news_read, x_news_search / x_news_get, web search for since-last-edition developments.
- Cast wide enough to catch what's new, then narrow to the strongest, newest receipts. Depth where it matters over breadth for its own sake; follow leads rather than enumerate tools.
Report this to the user as ONE high-level overview line (e.g. "Swept the active handles + reports, live stats, fresh news"), NOT a per-tool log or manifest.

## Phase 0 — Prior art & novelty gate (chat only — before Phase 1)
Establish what already exists so this edition does not re-derive the last one.
1. Locate prior Sphere / dual-map outputs from @aispace_bot (and any hot-window dual map). Fetch text/ids of the most recent 1–2 sphere-style posts.
2. Build a FORBIDDEN REUSE list: cluster titles + exhibits already used as the spine of the prior edition (do not rebuild these as sections).
3. Build a REQUIRED DELTA list: what is NEW since that post's date — new ships, new burns framing, new FUD vectors, new outside currents, new power-user pressure, new macro/privacy events.
4. Rule: if a candidate cluster only restates the prior map, drop it or compress it to a one-line "already mapped" footnote — never rebuild the same section.
5. Output in chat (short): prior-art ids + forbidden-reuse bullets + delta hunt targets. Then proceed to Phase 1 using delta-first evidence only.

## Phase 1 — Central (chat only — no draft yet)
Map the live pulse of the Venice / $VVV / DIEM sphere using:
- Hot window + intel_* tools for local library receipts
- stats_* (VeniceStats) for protocol/market/social pulse when relevant
- Live X/web/X News search when enabled and needed for fresher framing

Write a dense analytical brief IN CHAT covering all of:
1. Live snapshot (prices, stake, burns, DIEM capacity, free float, volume — via VeniceStats; name the source and link venicestats.com pages). Open with the DELTA since the last sphere report (date + post id), not a full re-map of the known thesis.
2. Core trending clusters (3–6). Each must carry at least one receipt dated after the prior edition, OR a clearly new angle on an old theme — NOT the prior edition's exhibit list. If evidence is mostly recycled, say so and shrink Clusters rather than pad.
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

Prefer outside currents NOT used as the prior edition's Related spine. For any recycled theme, require a new second-order effect or a new named example — otherwise drop it. Cover first-/second-order effects and the tension surface (pure local vs hybrid private capacity). Bottom line = what is NEWLY reinforcing the sphere theses, not a restatement of the last map.

Only after both Phase 1 and Phase 2 briefs exist in chat may you proceed.

## Phase 3 — Compile longform draft (Draft drawer)
Call compose_write_draft ONCE with:
- format: longform (single Premium long-form tweet; longform:true; NOT an X Article)
- dense brief that includes section outline, must-include facts, handles, post ids, cashtags, and permalink style for citations
- must include in the draft body: @handles, $cashtags (e.g. $VVV), post ids rewritten as https://x.com/i/status/{id}, and real urls where known
- explorative, informative longform — not a thread, not a short post
- MUST NOT paraphrase or reorder the exhibit inventory of the Phase 0 prior-art posts. Central must carry the delta/novelty framing; include new post permalinks (https://x.com/i/status/{id}) not used in the prior edition's body. If novelty is thin, draft shorter and label the gaps — do not invent.

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

After compose_write_draft: do NOT paste the full longform into chat. The Draft drawer holds the deliverable. Then continue immediately to Phase 4.

## Phase 4 — Conclusion (chat only — after the draft is written)
Once the draft exists in the Draft drawer, write a short conclusion IN CHAT (a few tight sentences or bullets — NOT another full report). Cover:
- What this edition delivered and how it differs from the prior edition (the delta / novelty in one line).
- The 2–3 highest-signal takeaways (the sphere's current center of gravity).
- What to watch next — open threads, thin spots, or signals to track for the next report.
- One line pointing the user to the Draft drawer for the finished longform.
Keep it skimmable. This is the sign-off, not a re-run of Phases 1–2.

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
