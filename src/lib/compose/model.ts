import type { VeniceModel } from '../../types/venice'
import { compareGrokDesc, isGrokModel } from '../venice-grok-utils'

// Compose defaults to the highest Grok with native X search so the assistant can
// research live X context while drafting. Resolution uses the live model list
// (version-ranked Groks, then any X-search model, then Venice default).

export const COMPOSE_FALLBACK_MODEL = 'venice-uncensored-1-2'

function pickFallbackModel(models: VeniceModel[]): string {
  const uncensored = models.find((m) => m.id === COMPOSE_FALLBACK_MODEL)
  if (uncensored) return uncensored.id

  const defaultTrait = models.find((m) => m.model_spec?.traits?.includes('default'))
  if (defaultTrait) return defaultTrait.id

  const sorted = [...models].sort((a, b) => a.id.localeCompare(b.id))
  return sorted[0]?.id ?? COMPOSE_FALLBACK_MODEL
}

/**
 * Pick the default compose model:
 * 1. Highest-version Grok with `supportsXSearch` (walk down Groks if needed)
 * 2. Any other X-search-capable model
 * 3. `venice-uncensored-1-2`, else the model tagged with the `default` trait
 */
export function pickComposeModel(models: VeniceModel[]): string {
  const groks = models.filter((m) => isGrokModel(m.id)).sort(compareGrokDesc)
  const grokWithX = groks.find((m) => m.model_spec?.capabilities?.supportsXSearch)
  if (grokWithX) return grokWithX.id

  const xSearch = models.filter((m) => m.model_spec?.capabilities?.supportsXSearch)
  if (xSearch.length > 0) return xSearch[0].id

  return pickFallbackModel(models)
}

/** Whether a given model id (from the loaded list) supports X search. */
export function modelSupportsXSearch(models: VeniceModel[], id: string): boolean {
  return Boolean(models.find((m) => m.id === id)?.model_spec?.capabilities?.supportsXSearch)
}
