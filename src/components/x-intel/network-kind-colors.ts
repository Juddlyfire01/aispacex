import type { EdgeKind } from '../../lib/x-intel/network-build'

/**
 * Base kind hues. Prefer {@link kindTint} for UI chrome (filters, legends, bars,
 * map accents) so every surface shares the same muted ~67% treatment.
 */
export const KIND_COLORS: Record<EdgeKind, string> = {
  mention: '#60a5fa',
  reply: '#34d399',
  quote: '#c084fc',
  retweet: '#fbbf24',
}

/** Hex alpha appended to {@link KIND_COLORS} (~67% opacity — half the prior mute). */
export const KIND_TINT_ALPHA = 'aa'

/** Muted kind color for borders, fills, swatches, and map accents. */
export function kindTint(kind: EdgeKind): string {
  return `${KIND_COLORS[kind]}${KIND_TINT_ALPHA}`
}
