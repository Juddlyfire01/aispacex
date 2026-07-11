import type { AppearanceSnapshot, Density, FontScale, Scale, SurfaceEmphasis, Typeface } from './appearance'
import { DEFAULT_TYPEFACE, resolveSurfaceEmphasis, resolveTypeface, SCALE_STEPS } from './appearance'

/** Plaintext localStorage key — readable by the pre-React FOUC boot script.
 *  Sensitive settings stay in the encrypted `venice-settings` blob; only
 *  non-sensitive chrome prefs are mirrored here for first paint. */
export const APPEARANCE_STORAGE_KEY = 'aispacex-appearance'

const THEMES = new Set(['dark', 'venice', 'grey', 'light'])

export function isThemeKey(value: unknown): value is string {
  return typeof value === 'string' && THEMES.has(value)
}

export function writeAppearanceSnapshot(appearance: AppearanceSnapshot): void {
  try {
    const payload = {
      theme: appearance.theme,
      scale: appearance.scale ?? appearance.zoom,
      fontScale: appearance.fontScale,
      typeface: resolveTypeface(appearance.typeface),
      density: appearance.density,
      surfaceEmphasis: resolveSurfaceEmphasis(appearance.surfaceEmphasis),
      reduceMotion: appearance.reduceMotion ?? false,
    }
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* private mode / quota */
  }
}

export function readAppearanceSnapshot(): AppearanceSnapshot | null {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as AppearanceSnapshot
    if (!s || typeof s !== 'object') return null
    return s
  } catch {
    return null
  }
}

/** Normalize a partial snapshot for applying to <html>. */
export function normalizeAppearance(s: AppearanceSnapshot): Required<
  Pick<
    AppearanceSnapshot,
    'theme' | 'scale' | 'fontScale' | 'typeface' | 'density' | 'surfaceEmphasis' | 'reduceMotion'
  >
> {
  const rawScale = s.scale ?? s.zoom ?? 100
  const scale = (SCALE_STEPS.includes(rawScale as Scale) ? rawScale : 100) as Scale
  const fontScale = (s.fontScale === 'sm' || s.fontScale === 'lg' ? s.fontScale : 'md') as FontScale
  const density = (s.density === 'compact' ? 'compact' : 'comfortable') as Density
  const theme = isThemeKey(s.theme) ? s.theme : 'dark'
  const typeface = resolveTypeface(s.typeface) as Typeface
  const surfaceEmphasis = resolveSurfaceEmphasis(s.surfaceEmphasis) as SurfaceEmphasis
  return {
    theme,
    scale,
    fontScale,
    typeface,
    density,
    surfaceEmphasis,
    reduceMotion: Boolean(s.reduceMotion),
  }
}
