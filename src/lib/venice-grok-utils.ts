import type { VeniceModel } from '../types/venice'

export function isGrokModel(id: string): boolean {
  return id.toLowerCase().includes('grok')
}

/** Comparable version tuple from ids like grok-4-20, grok-4-3, grok-build-0-1. */
export function grokVersionKey(id: string): number[] | null {
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
export function compareGrokDesc(a: VeniceModel, b: VeniceModel): number {
  const ka = grokVersionKey(a.id) ?? [0]
  const kb = grokVersionKey(b.id) ?? [0]
  const len = Math.max(ka.length, kb.length)
  for (let i = 0; i < len; i++) {
    const diff = (kb[i] ?? 0) - (ka[i] ?? 0)
    if (diff !== 0) return diff
  }
  return b.created - a.created
}

export function pickLatestGrokModel(models: VeniceModel[]): VeniceModel | undefined {
  const groks = models.filter((m) => isGrokModel(m.id)).sort(compareGrokDesc)
  return groks[0]
}
