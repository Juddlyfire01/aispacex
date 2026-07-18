import type { ComposeTemplateStarter } from './template-types'
import { buildStagePrompt } from './skill-pipeline'

export const POLISH_STARTER: ComposeTemplateStarter = {
  id: 'polish',
  label: 'Polish',
  hint: 'Revise the current draft against CRAFT + SPENT',
  blurb: 'tighten the draft in the drawer',
  preferredFormat: 'auto',
  buildPrompt: () =>
    buildStagePrompt({
      stage: 'polish',
      label: 'Polish',
      jobBody: `JOB — Polish the CURRENT draft:

Read the draft drawer text (also mirrored in SPENT when present). MUST call compose_write_draft with optional one-line revision intent (not a dense re-brief). The draft stage continues this transcript.

Revise against:
- Pre-publish checklist (hook, specificity, reply prompt, screenshot independence, anti-bait, length sweet spot, cadence)
- CADENCE — if chat advice is useful: ship-now vs wait for a better window / save the daily root slot; never invent exact best hour
- SPENT / PRIOR ART — do not reintroduce spent openers/slogans/spines; thin novelty → cut, don't pad
- Keep the user's preferred format unless they asked to change it (do not force a new format)

After compose_write_draft: short chat sign-off may include one cadence line (e.g. "good morning window candidate" / "hold if you already posted 2 roots today").`,
    }),
  buildDisplayMessage: () => 'Polish the current draft against CRAFT + SPENT.',
}
