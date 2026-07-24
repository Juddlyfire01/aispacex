import type { ComposeTemplateStarter } from './template-types'
import { buildStagePrompt } from './skill-pipeline'

export const POLISH_STARTER: ComposeTemplateStarter = {
  id: 'polish',
  label: 'Polish',
  hint: 'Revise the current draft against Register + SPENT',
  blurb: 'tighten the draft in the drawer',
  preferredFormat: 'auto',
  buildPrompt: () =>
    buildStagePrompt({
      stage: 'polish',
      label: 'Polish',
      jobBody: `JOB — Polish the CURRENT draft:

Read the draft drawer text (also mirrored in SPENT when present). MUST call compose_write_draft with optional one-line revision intent (not a dense re-brief). The draft stage continues this transcript.

Revise against:
- Register fidelity — match the selected voice; do not reshape for engagement theatre
- SPENT / PRIOR ART — do not reintroduce spent openers/slogans/spines; thin novelty → cut, don't pad
- Format — keep the user's preferred format unless they asked to change it
- Factual accuracy — claims must match the research transcript; cut invented denseness

After compose_write_draft: short chat sign-off only.`,
    }),
  buildDisplayMessage: () => 'Polish the current draft against Register + SPENT.',
}
