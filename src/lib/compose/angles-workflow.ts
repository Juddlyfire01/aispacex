import type { ComposeTemplateStarter } from './template-types'
import { buildStagePrompt } from './skill-pipeline'

export const ANGLES_STARTER: ComposeTemplateStarter = {
  id: 'angles',
  label: 'Angles',
  hint: 'Tier S/A/B candidates with [lever] / [end]',
  blurb: 'rank angles before you write',
  preferredFormat: 'auto',
  buildPrompt: () =>
    buildStagePrompt({
      stage: 'angles',
      label: 'Angles',
      jobBody: `JOB — Tiered angle candidates in CHAT ONLY (discourage compose_write_draft unless asked):

Using the Discover brief (or gather one first if missing), mine angles and score them. For each candidate include:
- Draftable one-liner / hook
- [lever] — which mechanism (dwell/reply/quote/profile…)
- [end] — reply prompt or CTA
- Tier: S (≥ ship now), A (strong), B (filler / weak)

HARD: mark any angle that collides with SPENT / PRIOR ART as Tier B or REJECT — do not promote spent openers, slogans, or exhibit spines.

Deliver Tier S first, then A, then B/rejects. Chat only — no draft tool unless the user asks to draft now.`,
    }),
  buildDisplayMessage: () => 'Generate Angles — tier S/A/B candidates with [lever] and [end].',
}
