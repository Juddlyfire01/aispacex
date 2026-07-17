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

MUST call compose_write_draft. Structure as the 5-beat skeleton:
1 Hook — strongest claim
2 Setup — why care
3 Meat — best insight
4 Elaboration — receipts / implications
5 Close — principle + reply prompt

Apply CRAFT hooks/levers/anti-bait. Respect SPENT. Prefer format: thread (segments separated by --- in the writer). Never paste the full thread into chat.`,
    }),
  buildDisplayMessage: () => 'Craft a thread — write it into the Draft drawer.',
}
