import type { ComposeTemplateStarter } from './template-types'
import { buildStagePrompt } from './skill-pipeline'

export const DISCOVER_STARTER: ComposeTemplateStarter = {
  id: 'discover',
  label: 'Discover',
  hint: 'Intelligence brief in chat — facts before angles',
  blurb: 'map the signal before you draft',
  preferredFormat: 'auto',
  buildPrompt: () =>
    buildStagePrompt({
      stage: 'discover',
      label: 'Discover',
      jobBody: `JOB — Intelligence brief in CHAT ONLY (do not call compose_write_draft unless the user explicitly demands a draft now):

Pull hot + cold context (intel_*, compose_history_*, stats_*, news/alpha/search as needed). Produce a structured intelligence brief:

1. Headline claim (1 sentence)
2. 5–10 specific numbers / receipts with sources (handles, post ids, VeniceStats links when citing stats)
3. 3–5 surprising decisions or contrasts
4. 5–10 gaps / unaddressed concerns
5. What is SPENT (from the attached pack) — note frames you must not reopen

Stay in chat. No publishable copy in the Draft drawer this stage.`,
    }),
  buildDisplayMessage: () => 'Generate a Discover intelligence brief from my library + live tools.',
}
