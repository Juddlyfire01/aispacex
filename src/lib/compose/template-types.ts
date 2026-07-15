import type { PreferredFormat } from './format'

/**
 * A one-click Compose research template (Sphere Report and its complements).
 *
 * Every template shares the same UX contract:
 *  - launched from the Templates menu / empty-state link
 *  - seeds a single hidden multi-phase prompt to the agent (`buildPrompt`)
 *  - shows a short launch line in the chat bubble (`buildDisplayMessage`)
 *  - forces a `preferredFormat` for the thread
 *  - researches in chat, then hands off a longform draft to the Draft drawer
 *
 * Templates differ only in the *shape* and *value* of the output, not the flow.
 */
export interface ComposeTemplateStarter {
  /** Stable id (also the workflow id). */
  id: string
  /** Menu row title + empty-state link label. */
  label: string
  /** One-line description under the label. */
  hint: string
  /** Short trailing blurb for the empty-state (" — {blurb}"). */
  blurb: string
  /** Format forced on the thread when launched. */
  preferredFormat: PreferredFormat
  /** Full multi-phase instructions sent to the model (not shown in chat). */
  buildPrompt: () => string
  /** Short launch line shown in the user bubble. */
  buildDisplayMessage: () => string
}
