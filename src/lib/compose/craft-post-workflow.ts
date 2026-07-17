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

MUST call compose_write_draft. Pass a dense brief (facts, angle, handles, constraints, [lever]/[end]). Never paste the full post into chat.

Apply CRAFT: hooks, levers (dwell→reply→profile), anti-bait checklist. Respect SPENT — new opener/slogan/spine or FAILED draft.

Prefer format: post (≤280 unless longform is required). After the tool: short status in chat only.`,
    }),
  buildDisplayMessage: () => 'Craft a post — write it into the Draft drawer.',
}
