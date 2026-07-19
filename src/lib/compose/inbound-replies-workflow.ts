import type { ComposeTemplateStarter } from './template-types'
import { buildStagePrompt } from './skill-pipeline'

export const INBOUND_REPLIES_STARTER: ComposeTemplateStarter = {
  id: 'inbound-replies',
  label: 'Inbound replies',
  hint: 'Library replies/mentions + ranked reply targets',
  blurb: 'scout who answered you',
  preferredFormat: 'auto',
  buildPrompt: () =>
    buildStagePrompt({
      stage: 'inbound-replies',
      label: 'Inbound replies',
      jobBody: `JOB — Inbound replies / mentions report in CHAT ONLY (do not call compose_write_draft unless the user explicitly demands a draft now):

Scope: posts + edges for the current Compose subject(s) (self / scoped library). Prefer HOT WINDOW first; use intel_* (edges, posts, grep) to complete coverage. Never invent post ids, handles, or counts.

Produce this fixed report shape (newest → oldest within each table):

1. **Header** — subject handle(s), library scope note, total inbound reply/mention count in scope (cite edge weight vs bodies-with-text when they differ).

2. **Real / conversational replies** — markdown table:
   | Date | From | Post ID | In reply to your post | Text | ♥ |
   Include every reply/mention with full text on file that is a real conversation (not mass-tag spam). Note when bodies are only partially hydrated.

3. **Mentions that tag you but are not direct replies** — shorter table (Date | From | Post ID | Notes). Giveaways, broadcast quotes, Spaces mass tags, shills.

4. **Mass-mention spam** — bullet list of post ids + one-line pattern. Ignore for engagement.

5. **Coverage gaps** — edge weight vs stored text; recent own posts with 0–1 replies and no inbound bodies yet; clarify that self-replies are not inbound.

6. **Highest-signal reply targets** (required) — ranked numbered list (3–7) of unreplied / high-signal conversational replies worth answering. For each: @handle, post id, one-line why it matters. Deprioritize promo/competitor pitches and spam.

Stay in chat. End with one optional filter offer (e.g. Venice/$DIEM only, unreplied only) — do not draft reply copy unless asked.`,
    }),
  buildDisplayMessage: () =>
    'List inbound replies to my posts on file — conversational vs spam, then ranked reply targets.',
}
