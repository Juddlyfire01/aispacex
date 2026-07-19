import type { VeniceModel } from '../../types/venice'
import { compareGrokDesc, isGrokModel } from '../venice-grok-utils'
import { resolveMostUncensoredModelId } from '../venice-model-utils'
import { DRAFT_MODEL_SAME } from './draft-writer-tool'

// Compose always sends tools + tool_choice. Only models with
// supportsFunctionCalling belong in the Post main-model picker.

export const COMPOSE_FALLBACK_MODEL = 'venice-uncensored-1-2'

export function modelSupportsFunctionCalling(m: VeniceModel | undefined | null): boolean {
  return m?.model_spec?.capabilities?.supportsFunctionCalling === true
}

/** Text models that can run the compose intel/history tool loop. */
export function filterComposeToolModels(models: VeniceModel[]): VeniceModel[] {
  return models.filter(modelSupportsFunctionCalling)
}

function pickFallbackModel(models: VeniceModel[]): string {
  const uncensored = models.find((m) => m.id === COMPOSE_FALLBACK_MODEL)
  if (uncensored) return uncensored.id

  const defaultTrait = models.find((m) => m.model_spec?.traits?.includes('default'))
  if (defaultTrait) return defaultTrait.id

  const sorted = [...models].sort((a, b) => a.id.localeCompare(b.id))
  return sorted[0]?.id ?? COMPOSE_FALLBACK_MODEL
}

/**
 * Pick the default compose research model (tool-capable only):
 * 1. Highest-version standard Grok with `supportsXSearch` (walk down Groks if needed)
 * 2. Any other X-search-capable model
 * 3. `venice-uncensored-1-2`, else the model tagged with the `default` trait
 *
 * Recomputed from the live catalog — when Venice ships a newer Grok, this id moves.
 */
export function pickComposeModel(models: VeniceModel[]): string {
  const eligible = filterComposeToolModels(models)
  if (eligible.length === 0) return COMPOSE_FALLBACK_MODEL

  const groks = eligible.filter((m) => isGrokModel(m.id)).sort(compareGrokDesc)
  const grokWithX = groks.find((m) => m.model_spec?.capabilities?.supportsXSearch)
  if (grokWithX) return grokWithX.id

  const xSearch = eligible.filter((m) => m.model_spec?.capabilities?.supportsXSearch)
  if (xSearch.length > 0) return xSearch[0]!.id

  return pickFallbackModel(eligible)
}

/**
 * Pin the live research default first, then alphabetical by display name.
 */
export function sortComposeResearchModels(
  models: VeniceModel[],
  preferredModelId?: string,
): VeniceModel[] {
  const eligible = filterComposeToolModels(models)
  const pinned = preferredModelId || pickComposeModel(eligible)
  return [...eligible].sort((a, b) => {
    const aPin = a.id === pinned ? 0 : 1
    const bPin = b.id === pinned ? 0 : 1
    if (aPin !== bPin) return aPin - bPin
    const an = a.model_spec?.name || a.id
    const bn = b.model_spec?.name || b.id
    return an.localeCompare(bn)
  })
}

/** Option text for the research model picker (name + optional · default). */
export function formatComposeResearchLabel(
  model: VeniceModel | { id: string; model_spec?: { name?: string } | null },
  researchDefaultId?: string,
): string {
  const name = plainModelDisplayName(model.model_spec?.name || model.id)
  if (researchDefaultId && model.id === researchDefaultId) return `${name} · default`
  return name
}

/**
 * Venice sometimes ships `model_spec.name` with Mathematical Alphanumeric Symbols
 * (bold/italic “logo” letterforms). Native <select> options then render mixed fonts.
 * Map those code points back to plain ASCII so the picker stays visually uniform.
 */
export function plainModelDisplayName(raw: string): string {
  let out = ''
  for (const ch of raw.normalize('NFKC')) {
    const cp = ch.codePointAt(0)!
    out += mathAlphanumericToAscii(cp) ?? ch
  }
  return out
}

/** Common Mathematical Alphanumeric Symbols ranges → ASCII. */
function mathAlphanumericToAscii(cp: number): string | null {
  // Bold / italic / bold-italic / script / bold-script / fraktur / …
  // Latin capital pairs (26 letters) starting at each block base.
  const capitalBlocks = [
    0x1d400, 0x1d434, 0x1d468, 0x1d49c, 0x1d4d0, 0x1d504, 0x1d56c, 0x1d5a0,
    0x1d5d4, 0x1d608, 0x1d63c, 0x1d670,
  ]
  for (const start of capitalBlocks) {
    if (cp >= start && cp < start + 26) return String.fromCharCode(65 + (cp - start))
  }
  // Latin small pairs (26 letters). Some script/fraktur blocks have holes —
  // only map when the offset is a contiguous a–z run.
  const smallBlocks = [
    0x1d41a, 0x1d44e, 0x1d482, 0x1d4b6, 0x1d4ea, 0x1d51e, 0x1d552, 0x1d586,
    0x1d5ba, 0x1d5ee, 0x1d622, 0x1d656, 0x1d68a,
  ]
  for (const start of smallBlocks) {
    if (cp >= start && cp < start + 26) return String.fromCharCode(97 + (cp - start))
  }
  // Bold digits 0-9
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return String.fromCharCode(48 + (cp - 0x1d7ce))
  if (cp >= 0x1d7e2 && cp <= 0x1d7eb) return String.fromCharCode(48 + (cp - 0x1d7e2))
  if (cp >= 0x1d7ec && cp <= 0x1d7f5) return String.fromCharCode(48 + (cp - 0x1d7ec))
  if (cp >= 0x1d7f6 && cp <= 0x1d7ff) return String.fromCharCode(48 + (cp - 0x1d7f6))
  return null
}

/**
 * True when the stored research model should move to the live catalog default.
 * Upgrades empty / missing / non-tool picks, and follows the latest standard Grok
 * when the user was still on the previous default (not an intentional older pick).
 */
export function shouldUpgradeComposeResearchModel(
  model: string,
  models: VeniceModel[],
): boolean {
  if (!models.length) return false
  const preferred = pickComposeModel(models)
  if (!model) return true
  if (!modelIdSupportsFunctionCalling(models, model)) return true
  if (!models.some((m) => m.id === model)) return true
  if (model === preferred) return false

  // Still on previous catalog default → follow when Venice ships a newer Grok.
  const withoutPreferred = models.filter((m) => m.id !== preferred)
  if (withoutPreferred.length === 0) return false
  return pickComposeModel(withoutPreferred) === model
}

/** Whether a given model id (from the loaded list) supports X search. */
export function modelSupportsXSearch(models: VeniceModel[], id: string): boolean {
  return Boolean(models.find((m) => m.id === id)?.model_spec?.capabilities?.supportsXSearch)
}

/** Whether a given model id supports function calling / tools. */
export function modelIdSupportsFunctionCalling(models: VeniceModel[], id: string): boolean {
  return modelSupportsFunctionCalling(models.find((m) => m.id === id))
}

function isVeniceUncensoredModel(m: VeniceModel): boolean {
  return (
    m.model_spec?.traits?.includes('most_uncensored') === true ||
    /^venice-uncensored/i.test(m.id)
  )
}

function isVeniceUncensoredId(id: string): boolean {
  return /^venice-uncensored/i.test(id)
}

/**
 * Sort draft-writer candidates: most_uncensored / Venice Uncensored first,
 * then alphabetical. Includes non-tool models (writer needs no tools).
 */
export function sortDraftWriterModels(
  models: VeniceModel[],
  mostUncensoredModelId?: string,
): VeniceModel[] {
  const pinned =
    mostUncensoredModelId || resolveMostUncensoredModelId(models, undefined) || COMPOSE_FALLBACK_MODEL
  return [...models].sort((a, b) => {
    const aPin = a.id === pinned ? 0 : 1
    const bPin = b.id === pinned ? 0 : 1
    if (aPin !== bPin) return aPin - bPin
    const aUn = isVeniceUncensoredModel(a) ? 0 : 1
    const bUn = isVeniceUncensoredModel(b) ? 0 : 1
    if (aUn !== bUn) return aUn - bUn
    const an = a.model_spec?.name || a.id
    const bn = b.model_spec?.name || b.id
    return an.localeCompare(bn)
  })
}

/**
 * Draft writer default: Venice `most_uncensored` trait (latest Uncensored SKU),
 * else hardcoded fallback id. Moves when Venice retags `most_uncensored` (e.g. 1.3 / 2.0).
 */
export function pickDefaultDraftModel(
  models: VeniceModel[],
  mostUncensoredModelId?: string,
): string {
  if (mostUncensoredModelId && models.some((m) => m.id === mostUncensoredModelId)) {
    return mostUncensoredModelId
  }
  return resolveMostUncensoredModelId(models, undefined) || COMPOSE_FALLBACK_MODEL
}

/**
 * True when the stored draft writer should move to the live most_uncensored SKU.
 * Follows Venice trait updates when the user was still on the previous default.
 */
export function shouldUpgradeDraftModel(
  draftModel: string,
  models: VeniceModel[],
  mostUncensoredModelId?: string,
  catalogDefaultModelId?: string,
): boolean {
  if (!models.length) return false
  // Empty / "same" is intentional default — do not seed a separate writer model.
  if (!draftModel || draftModel === DRAFT_MODEL_SAME) return false
  const preferred = pickDefaultDraftModel(models, mostUncensoredModelId)
  if (!models.some((m) => m.id === draftModel)) return true
  if (draftModel === preferred) return false

  // Prior mistaken seed: catalog `default` (e.g. GLM) instead of most_uncensored.
  if (
    catalogDefaultModelId &&
    draftModel === catalogDefaultModelId &&
    draftModel !== preferred
  ) {
    return true
  }

  if (!isVeniceUncensoredId(draftModel)) return false

  const withoutPreferred = models.filter((m) => m.id !== preferred)
  if (withoutPreferred.length === 0) return false
  return pickDefaultDraftModel(withoutPreferred, undefined) === draftModel
}
