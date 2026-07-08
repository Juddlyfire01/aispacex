import type { VeniceModel } from '../../types/venice'
import { pickLatestGrokModel } from '../venice-grok-utils'

/** Prior hard-coded synthesis default — used to auto-upgrade on model catalog load. */
export const LEGACY_SYNTHESIS_DEFAULT = 'venice-uncensored-1-2'

function isVeniceUncensored(id: string): boolean {
  return id.toLowerCase().includes('venice-uncensored')
}

function uncensoredVersionKey(id: string): [number, number] {
  const m = id.match(/venice-uncensored-(\d+)-(\d+)/i)
  if (!m) return [0, 0]
  return [Number(m[1]), Number(m[2])]
}

function compareUncensoredDesc(a: VeniceModel, b: VeniceModel): number {
  const [aMaj, aMin] = uncensoredVersionKey(a.id)
  const [bMaj, bMin] = uncensoredVersionKey(b.id)
  if (bMaj !== aMaj) return bMaj - aMaj
  if (bMin !== aMin) return bMin - aMin
  return b.id.localeCompare(a.id)
}

function pickVeniceUncensoredDefault(models: VeniceModel[]): string | undefined {
  const uncensored = models.filter((m) => isVeniceUncensored(m.id))
  if (!uncensored.length) return undefined

  const traitDefault = uncensored.find((m) => m.model_spec?.traits?.includes('default'))
  if (traitDefault) return traitDefault.id

  const sorted = [...uncensored].sort(compareUncensoredDesc)
  return sorted[0]?.id
}

/**
 * Default intel synthesis model:
 * 1. Latest standard Grok (version-ranked; base id preferred over variants)
 * 2. Venice uncensored with the `default` trait, else highest-version uncensored id
 * 3. Any model tagged `default`, else first model alphabetically by id
 */
export function pickSynthesisModel(models: VeniceModel[]): string {
  const grok = pickLatestGrokModel(models)
  if (grok) return grok.id

  const uncensored = pickVeniceUncensoredDefault(models)
  if (uncensored) return uncensored

  const traitDefault = models.find((m) => m.model_spec?.traits?.includes('default'))
  if (traitDefault) return traitDefault.id

  const sorted = [...models].sort((a, b) => a.id.localeCompare(b.id))
  return sorted[0]?.id ?? LEGACY_SYNTHESIS_DEFAULT
}

/** True when a stored model should be replaced with the live catalog default. */
export function shouldUpgradeSynthesisModel(model: string, models: { id: string }[]): boolean {
  if (!model) return true
  if (model === LEGACY_SYNTHESIS_DEFAULT) return true
  return !models.some((m) => m.id === model)
}
