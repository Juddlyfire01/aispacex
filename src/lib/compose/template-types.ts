import type { PreferredFormat } from './format'

/**
 * A one-click Compose skill-stage starter (Discover → Inbound replies → Angles → Craft → Polish).
 *
 * UX contract:
 *  - launched from the Templates menu / empty-state link
 *  - seeds a hidden stage prompt to the agent (`buildPrompt`)
 *  - shows a short launch line in the chat bubble (`buildDisplayMessage`)
 *  - `preferredFormat: 'auto'` means launch does NOT call setPreferredFormat
 *  - other formats force the thread preference on launch
 *
 * All tools remain available every stage; stages differ only in job/output.
 */
export interface ComposeTemplateStarter {
  /** Stable id (also the stage id). */
  id: string
  /** Menu row title + empty-state link label. */
  label: string
  /** One-line description under the label. */
  hint: string
  /** Short trailing blurb for the empty-state (" — {blurb}"). */
  blurb: string
  /**
   * Format preference when launched.
   * `'auto'` = leave the thread format unchanged (do not call setPreferredFormat).
   */
  preferredFormat: PreferredFormat
  /** Full stage instructions sent to the model (not shown in chat). */
  buildPrompt: () => string
  /** Short launch line shown in the user bubble. */
  buildDisplayMessage: () => string
}
