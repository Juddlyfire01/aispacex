/**
 * Registry of one-click Compose research templates.
 *
 * The Sphere Report (breadth) plus four complements, each a distinct job:
 *  - Sphere Report  — breadth   — neutral landscape map
 *  - Signal Dossier — depth     — single-node biography
 *  - By the Numbers — rigor      — metric-led data story
 *  - Rebuttal Brief — defense    — counters one bear claim
 *  - Bull Thesis    — conviction — compounding positive case
 *
 * The Templates menu + empty-state render straight from COMPOSE_TEMPLATES, so
 * adding a template here surfaces it in the UI with no component changes.
 */

import type { ComposeTemplateStarter } from './template-types'
import { SPHERE_REPORT_STARTER } from './sphere-report-workflow'
import { SIGNAL_DOSSIER_STARTER } from './signal-dossier-workflow'
import { BY_THE_NUMBERS_STARTER } from './by-the-numbers-workflow'
import { REBUTTAL_BRIEF_STARTER } from './rebuttal-brief-workflow'
import { BULL_THESIS_STARTER } from './bull-thesis-workflow'

export type { ComposeTemplateStarter }

/** Order here is the order shown in the Templates menu. */
export const COMPOSE_TEMPLATES: readonly ComposeTemplateStarter[] = [
  SPHERE_REPORT_STARTER,
  SIGNAL_DOSSIER_STARTER,
  BY_THE_NUMBERS_STARTER,
  REBUTTAL_BRIEF_STARTER,
  BULL_THESIS_STARTER,
]

/** Primary template featured in the empty-state prompt. */
export const PRIMARY_TEMPLATE = SPHERE_REPORT_STARTER
