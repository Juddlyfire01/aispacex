import type { ComposeTemplateStarter } from './template-types'
import { buildStagePrompt } from './skill-pipeline'

export const CRAFT_THREAD_STARTER: ComposeTemplateStarter = {
  id: 'craft-thread',
  label: 'Craft thread',
  hint: 'Thread via compose_write_draft',
  blurb: 'write a thread into the Draft drawer',
  preferredFormat: 'thread',
  buildPrompt: () =>
    buildStagePrompt({
      stage: 'craft-thread',
      label: 'Craft thread',
      jobBody: `JOB — Craft a publishable thread:

MUST call compose_write_draft with format:"thread" and optional one-line intent (content or format directive only). Do not pass a dense knowledge brief — research stays in this thread.

Default: a coherent thread that develops the claim from the research — no forced hook→CTA skeleton, no mandatory reply-bait close. If the user asked for a specific beat structure, honor that in intent; otherwise let the claim dictate shape.

Respect SPENT. Never paste the full thread into chat.`,
    }),
  buildDisplayMessage: () => 'Craft a thread — write it into the Draft drawer.',
}
