import type { ComposeTemplateStarter } from './template-types'
import { buildStagePrompt } from './skill-pipeline'

export const CRAFT_POST_STARTER: ComposeTemplateStarter = {
  id: 'craft-post',
  label: 'Craft post',
  hint: 'Single post via compose_write_draft',
  blurb: 'write one post into the Draft drawer',
  preferredFormat: 'post',
  buildPrompt: () =>
    buildStagePrompt({
      stage: 'craft-post',
      label: 'Craft post',
      jobBody: `JOB — Craft a single publishable post:

MUST call compose_write_draft with format:"post" and optional one-line intent (e.g. lever/end). Do not pass a dense knowledge brief — research stays in this thread for the draft stage. Never paste the full post into chat.

Respect SPENT — new opener/slogan/spine or FAILED draft.

After the tool: short status in chat only.`,
    }),
  buildDisplayMessage: () => 'Craft a post — write it into the Draft drawer.',
}
