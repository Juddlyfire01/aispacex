// x402 charged-price math. Turns raw itemized cost (from the unified ledger)
// into the USD amount a user is billed in paid mode, applying the single margin
// multiplier. Owned-Read savings stay in margin (raw costs use "others" rates).
// X daily dedup is reflected in raw cost only when VITE_X402_PASS_X_DEDUP is on.

import type { CostEntry, CostKind, CostProvider } from '../cost/ledger'
import { applyMargin, X402_MARGIN } from './config'

/** A single line in the pre-action cost preview. */
export interface PricePreviewLine {
  label: string
  provider: CostProvider
  kind: CostKind
  units: number
  rawUsd: number
  chargedUsd: number
}

export interface PricePreview {
  lines: PricePreviewLine[]
  rawUsd: number
  chargedUsd: number
  margin: number
}

const KIND_LABELS: Record<string, string> = {
  posts: 'Post reads',
  users: 'User lookups',
  likes: 'Like reads',
  counts: 'Recent counts',
  news_search: 'News scan',
  post_create: 'Post publish',
  post_create_url: 'Post publish (with link)',
  text: 'AI text',
  image: 'Image generation',
  image_edit: 'Image edit',
  image_upscale: 'Image upscale',
  video: 'Video generation',
  music: 'Music generation',
  tts: 'Speech synthesis',
}

function labelFor(kind: CostKind): string {
  return KIND_LABELS[kind as string] ?? String(kind)
}

/** Charged price for a single raw USD cost. */
export function chargedPrice(rawUsd: number): number {
  return applyMargin(rawUsd)
}

/**
 * Build a per-line cost preview from ledger entries (typically the entries of a
 * single pending action). Aggregates by kind for a compact display.
 */
export function buildPreview(entries: CostEntry[]): PricePreview {
  const byKind = new Map<string, PricePreviewLine>()
  for (const e of entries) {
    const key = `${e.provider}:${e.kind}`
    let line = byKind.get(key)
    if (!line) {
      line = {
        label: labelFor(e.kind),
        provider: e.provider,
        kind: e.kind,
        units: 0,
        rawUsd: 0,
        chargedUsd: 0,
      }
      byKind.set(key, line)
    }
    line.units += e.units
    line.rawUsd += e.rawUsd
  }
  const lines = [...byKind.values()]
  let rawUsd = 0
  for (const line of lines) {
    line.chargedUsd = chargedPrice(line.rawUsd)
    rawUsd += line.rawUsd
  }
  return {
    lines,
    rawUsd,
    chargedUsd: chargedPrice(rawUsd),
    margin: X402_MARGIN,
  }
}

/** Estimate a charged price from a projected raw cost (pre-execution). */
export function estimateChargedFromRaw(projectedRawUsd: number): number {
  return chargedPrice(projectedRawUsd)
}
