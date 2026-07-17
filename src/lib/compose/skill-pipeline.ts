/**
 * Shared scaffolding for Compose skill-stage starters.
 * Stages differ in job/output only — never strip tools.
 */

export type SkillStageId = 'discover' | 'angles' | 'craft-post' | 'craft-thread' | 'polish'

export interface StagePromptConfig {
  stage: SkillStageId
  /** Human label, e.g. "Discover". */
  label: string
  /** Stage-specific job body (what to produce). */
  jobBody: string
  /** Extra constraints appended after the job body. */
  extras?: string
}

/** Full Compose tool surface — always available every stage. */
export function fullToolsReminder(): string {
  return `TOOLS (all always available — never invent others):
- intel_* — local X intel library (subjects, posts, reports, edges, profile)
- compose_history_* — prior compose threads
- stats_* — VeniceStats live protocol/market/social/wallet
- alpha_* — Alpha Radar archive (prefer HOT WINDOW Alpha slice first)
- news_read — bookmarked RSS full text
- x_news_search / x_news_get — when X News is enabled
- Live web / X search — when enabled in settings
- compose_write_draft — streams publishable copy into the Draft drawer

Prefer the HOT WINDOW on the latest user message first; use tools to extend. Never invent post ids, handles, metrics, or thread ids.`
}

/** Trust the injected SPENT pack; tools only to extend it. */
export function spentReminder(): string {
  return `SPENT / PRIOR ART (mandatory):
- A ## SPENT / PRIOR ART block may be attached on this turn (own posts + prior draft bodies + current draft).
- Treat that pack as ground truth for what is already used: openers, slogans, exhibit spines, status ids, heavy $/@ stacks.
- Tools may EXTEND the pack (deeper history / older posts) — do not ignore or contradict it.
- Reusing a spent opener, slogan, or exhibit spine = FAILED output. Thin novelty → shorter, never pad.`
}

/** Handoff expectations between stages. */
export function handoffContract(stage: SkillStageId): string {
  const lines = [
    'HANDOFF CONTRACT:',
    '- Never recycle SPENT material as a new edition.',
  ]
  if (stage === 'discover' || stage === 'angles') {
    lines.push(
      '- Leave structured artifacts in CHAT (brief / tiered angles). Do not write the publishable draft in chat.',
      '- Prefer chat deliverables; discourage early compose_write_draft unless the user explicitly asks to draft now.',
    )
  } else if (stage === 'craft-post' || stage === 'craft-thread') {
    lines.push(
      '- Prefer an in-thread brief (from Discover/Angles or this conversation) over inventing a new thesis.',
      '- MUST call compose_write_draft — the Draft drawer owns the copy. Never paste the full draft into chat.',
    )
  } else {
    lines.push(
      '- Revise the CURRENT draft (drawer / SPENT currentDraft) against the checklist + SPENT.',
      '- MUST call compose_write_draft with a revision brief. Prefer in-thread context; never recycle SPENT as new.',
    )
  }
  return lines.join('\n')
}

/** Assemble a stage prompt with shared blocks. */
export function buildStagePrompt(config: StagePromptConfig): string {
  const parts = [
    `SKILL STAGE: ${config.label} (${config.stage})`,
    '',
    config.jobBody.trim(),
  ]
  if (config.extras?.trim()) {
    parts.push('', config.extras.trim())
  }
  parts.push('', fullToolsReminder(), '', spentReminder(), '', handoffContract(config.stage))
  parts.push(
    '',
    'Do not exit early. Complete this stage\'s deliverable before offering the next stage.',
  )
  return parts.join('\n')
}
