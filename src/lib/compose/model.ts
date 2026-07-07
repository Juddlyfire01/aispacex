import type { VeniceModel } from '../../types/venice'

// Compose defaults to the highest Grok with native X search so the assistant can
// research live X context while drafting. Resolution uses the live model list
// (version-ranked Groks, then any X-search model, then Venice default).

export const COMPOSE_FALLBACK_MODEL = 'venice-uncensored-1-2'

function isGrokModel(id: string): boolean {
  return id.toLowerCase().includes('grok')
}

/** Comparable version tuple from ids like grok-4-20, grok-4-3, grok-build-0-1. */
function grokVersionKey(id: string): number[] | null {
  const lower = id.toLowerCase()
  if (!lower.includes('grok')) return null

  const build = lower.match(/^grok-build-(\d+)-(\d+)/)
  if (build) return [0, Number(build[1]), Number(build[2])]

  const std = lower.match(/^grok-(\d+)-(\d+)/)
  if (std) {
    const major = Number(std[1])
    const minor = Number(std[2])
    // Base ids (no suffix) outrank variants like -multi-agent at the same version.
    const variantRank = /^grok-\d+-\d+$/.test(lower) ? 1 : 0
    return [major, minor, variantRank]
  }

  return [0]
}

/** Highest Grok first; `created` breaks ties when version keys match. */
function compareGrokDesc(a: VeniceModel, b: VeniceModel): number {
  const ka = grokVersionKey(a.id) ?? [0]
  const kb = grokVersionKey(b.id) ?? [0]
  const len = Math.max(ka.length, kb.length)
  for (let i = 0; i < len; i++) {
    const diff = (kb[i] ?? 0) - (ka[i] ?? 0)
    if (diff !== 0) return diff
  }
  return b.created - a.created
}

function pickFallbackModel(models: VeniceModel[]): string {
  const uncensored = models.find((m) => m.id === COMPOSE_FALLBACK_MODEL)
  if (uncensored) return uncensored.id

  const defaultTrait = models.find((m) => m.model_spec?.traits?.includes('default'))
  if (defaultTrait) return defaultTrait.id

  return models[0]?.id ?? COMPOSE_FALLBACK_MODEL
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
