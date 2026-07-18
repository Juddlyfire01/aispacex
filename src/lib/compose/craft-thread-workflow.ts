import type { ComposeTemplateStarter } from './template-types'
import { buildStagePrompt } from './skill-pipeline'

export const CRAFT_THREAD_STARTER: ComposeTemplateStarter = {
  id: 'craft-thread',
  label: 'Craft thread',
  hint: '5-beat thread via compose_write_draft',
  blurb: 'write a thread into the Draft drawer',
  preferredFormat: 'thread',
  buildPrompt: () =>
    buildStagePrompt({
      stage: 'craft-thread',
      label: 'Craft thread',
      jobBody: `JOB — Craft a publishable thread:

MUST call compose_write_draft with format:"thread" and optional one-line intent. Do not pass a dense knowledge brief — research stays in this thread. Structure the draft stage should follow:
1 Hook — strongest claim
2 Setup — why care
3 Meat — best insight
4 Elaboration — receipts / implications
5 Close — principle + reply prompt

Respect SPENT. Never paste the full thread into chat.`,
    }),
  buildDisplayMessage: () => 'Craft a thread — write it into the Draft drawer.',
}
