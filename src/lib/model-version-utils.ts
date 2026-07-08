import type { VeniceModel } from '../types/venice'

/**
 * Parse a dotted version label as a decimal number.
 * e.g. "4.20" → 4.2, "4.3" → 4.3, so 4.3 correctly outranks 4.20.
 */
export function parseDecimalVersion(version: string): number {
  return Number(version)
}

/** Extract a dotted version string from a model display name or id. */
export function extractModelVersion(model: Pick<VeniceModel, 'id' | 'model_spec'>): string | null {
  const name = model.model_spec?.name
  if (name) {
    const fromName = name.match(/(\d+(?:\.\d+)+)/)
    if (fromName) return fromName[1]
  }

  const fromId = model.id.match(/(\d+(?:-\d+)+)/)
  if (fromId) return fromId[1].replace(/-/g, '.')

  return null
}

/** Higher rank = prefer this id when versions tie (base release over variants). */
export function modelVariantRank(model: Pick<VeniceModel, 'id' | 'model_spec'>): number {
  if (/-multi-agent/i.test(model.id)) return 0
  if (/-beta/i.test(model.id) || model.model_spec?.betaModel) return 0
  return 1
}

/**
 * Sort newest-first by decimal version, then base over variants, then catalog `created`.
 * Works for any model family — not Grok-specific.
 */
export function compareModelsByVersionDesc(a: VeniceModel, b: VeniceModel): number {
  const va = extractModelVersion(a)
  const vb = extractModelVersion(b)

  if (va && vb) {
    const versionDiff = parseDecimalVersion(vb) - parseDecimalVersion(va)
    if (versionDiff !== 0) return versionDiff

    const variantDiff = modelVariantRank(b) - modelVariantRank(a)
    if (variantDiff !== 0) return variantDiff
  } else if (va) {
    return -1
  } else if (vb) {
    return 1
  }

  const createdDiff = b.created - a.created
  if (createdDiff !== 0) return createdDiff

  return a.id.localeCompare(b.id)
}

export function pickNewestModel(models: VeniceModel[]): VeniceModel | undefined {
  if (!models.length) return undefined
  return [...models].sort(compareModelsByVersionDesc)[0]
}
