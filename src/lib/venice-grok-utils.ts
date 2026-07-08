import type { VeniceModel } from '../types/venice'
import { compareModelsByVersionDesc, pickNewestModel } from './model-version-utils'

export function isGrokModel(id: string): boolean {
  return id.toLowerCase().includes('grok')
}

/** Highest Grok first — ranked by decimal version, not integer id segments. */
export function compareGrokDesc(a: VeniceModel, b: VeniceModel): number {
  return compareModelsByVersionDesc(a, b)
}

export function pickLatestGrokModel(models: VeniceModel[]): VeniceModel | undefined {
  return pickNewestModel(models.filter((m) => isGrokModel(m.id)))
}
