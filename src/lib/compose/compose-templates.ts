/**
 * Registry of Compose skill-stage starters.
 *
 * Pipeline: Discover → Angles → Craft post → Craft thread → Polish.
 * Stages differ in job/output only — full tool surface every stage.
 * Templates menu + empty-state render from COMPOSE_TEMPLATES.
 */

import type { ComposeTemplateStarter } from './template-types'
import { DISCOVER_STARTER } from './discover-workflow'
import { ANGLES_STARTER } from './angles-workflow'
import { CRAFT_POST_STARTER } from './craft-post-workflow'
import { CRAFT_THREAD_STARTER } from './craft-thread-workflow'
import { POLISH_STARTER } from './polish-workflow'

export type { ComposeTemplateStarter }

/** Order here is the order shown in the Templates menu. */
export const COMPOSE_TEMPLATES: readonly ComposeTemplateStarter[] = [
  DISCOVER_STARTER,
  ANGLES_STARTER,
  CRAFT_POST_STARTER,
  CRAFT_THREAD_STARTER,
  POLISH_STARTER,
]

/** Primary template featured in the empty-state prompt. */
export const PRIMARY_TEMPLATE = DISCOVER_STARTER
