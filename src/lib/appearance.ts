export const SCALE_STEPS = [90, 100, 110, 125] as const
export type Scale = (typeof SCALE_STEPS)[number]

export const FONT_SCALE_MAP = { sm: 0.9, md: 1, lg: 1.12 } as const
export type FontScale = keyof typeof FONT_SCALE_MAP

export const DENSITY_SPACE_MAP = { compact: 0.82, comfortable: 1 } as const
export type Density = keyof typeof DENSITY_SPACE_MAP

/**
 * Typeface family themes — free/system stacks that evoke each product.
 * Proprietary faces (Chirp, CursorGothic, Aeonik/Canela) are not redistributable.
 *
 * AiSpace stack mirrors D:/Cursor/aispace:
 *   Inter body · Space Grotesk UI/chat · Orbitron display/wordmark
 * Here UI sans = Space Grotesk (product voice); mono stays JetBrains for data.
 */
export const TYPEFACE_IDS = ['aispace', 'x', 'cursor', 'venice', 'dossier'] as const
export type Typeface = (typeof TYPEFACE_IDS)[number]
export const DEFAULT_TYPEFACE: Typeface = 'aispace'

export interface TypefaceStacks {
  sans: string
  mono: string
}

export const TYPEFACE_STACKS: Record<Typeface, TypefaceStacks> = {
  /** Sibling AiSpace app: Space Grotesk UI + JetBrains Mono data. */
  aispace: {
    sans: '"Space Grotesk", "Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Cascadia Mono", "SF Mono", Consolas, monospace',
  },
  /** X-like: Chirp is proprietary — public Chirp fallback / pre-Chirp system stack. */
  x: {
    sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  /** Cursor-like: Inter UI + JetBrains Mono (editor default vibe; CursorGothic is proprietary). */
  cursor: {
    sans: '"Inter", "InterVariable", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Cascadia Mono", "SF Mono", Consolas, monospace',
  },
  /** Venice-inspired open stand-in (brand is Aeonik/Canela — not free). */
  venice: {
    sans: '"Inter", "InterVariable", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Cascadia Mono", "SF Mono", Consolas, monospace',
  },
  /** FOIA/dossier mood — not an official FBI face. */
  dossier: {
    sans: '"IBM Plex Sans", "Source Sans 3", system-ui, sans-serif',
    mono: '"IBM Plex Mono", "Courier Prime", "Courier New", Courier, monospace',
  },
}

export const TYPEFACE_OPTIONS: Array<{ value: Typeface; label: string; hint: string }> = [
  { value: 'aispace', label: 'AiSpace', hint: 'Space Grotesk · JetBrains Mono' },
  { value: 'x', label: 'X', hint: 'System UI (Chirp-inspired fallback)' },
  { value: 'cursor', label: 'Cursor', hint: 'Inter · JetBrains Mono' },
  { value: 'venice', label: 'Venice', hint: 'Inter · JetBrains Mono' },
  { value: 'dossier', label: 'Dossier', hint: 'IBM Plex Sans · IBM Plex Mono' },
]

export function isTypeface(value: unknown): value is Typeface {
  return typeof value === 'string' && (TYPEFACE_IDS as readonly string[]).includes(value)
}

export function resolveTypeface(value: unknown): Typeface {
  return isTypeface(value) ? value : DEFAULT_TYPEFACE
}

/** Pixel text sizes used across the app — kept in sync with index.css font-scale rules. */
export const TEXT_PX_SIZES = [
  9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 15.5, 16, 17, 18, 20, 22,
] as const

export function scaleToFactor(scale: Scale): number {
  return scale / 100
}

export interface AppearanceSnapshot {
  theme?: string
  scale?: Scale | number
  zoom?: Scale | number
  fontScale?: FontScale | string
  typeface?: Typeface | string
  density?: Density | string
  reduceMotion?: boolean
}

export const FAVICON_VERSION = '12'

/** True for light UI chrome; all other themes use dark-theme mark assets. */
export function isLightTheme(theme: string): boolean {
  return theme === 'light'
}

/**
 * AiSpace app key mark (favicon, sidebar logo).
 * dark theme → white key; light theme → black key.
 */
export function aispaceLogoHrefForTheme(theme: string): string {
  return isLightTheme(theme) ? '/aispace-logo-light.svg' : '/aispace-logo-dark.svg'
}

/**
 * Venice crossed-keys mark (Venice cost meter, Venice-branded UI).
 * dark theme → light-fill keys; light theme → dark-fill keys.
 */
export function veniceKeysLogoHrefForTheme(theme: string): string {
  return isLightTheme(theme) ? '/venice-keys-logo-light.svg' : '/venice-keys-logo-dark.svg'
}

/**
 * X logo mark.
 * dark theme → white X; light theme → black X.
 */
export function xLogoHrefForTheme(theme: string): string {
  return isLightTheme(theme) ? '/x-logo-light.svg' : '/x-logo-dark.svg'
}

/** Favicon = AiSpace key, versioned for cache bust. */
export function faviconHrefForTheme(theme: string): string {
  return `${aispaceLogoHrefForTheme(theme)}?v=${FAVICON_VERSION}`
}

export function applyFaviconForTheme(theme: string, doc: Document = document) {
  const href = faviconHrefForTheme(theme)
  let link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = doc.createElement('link')
    link.rel = 'icon'
    doc.head.appendChild(link)
  }
  link.type = 'image/svg+xml'
  // Assigning .href forces the browser to re-fetch (path-only setAttribute can stick in cache).
  link.href = href
}

export function applyAppearanceToHtml(el: HTMLElement, appearance: AppearanceSnapshot) {
  const rawScale = appearance.scale ?? appearance.zoom ?? 100
  const scale = (SCALE_STEPS.includes(rawScale as Scale) ? rawScale : 100) as Scale
  const fontKey = (appearance.fontScale ?? 'md') as FontScale
  const fontScale = FONT_SCALE_MAP[fontKey in FONT_SCALE_MAP ? fontKey : 'md']
  const densityKey = (appearance.density ?? 'comfortable') as Density
  const densitySpace = DENSITY_SPACE_MAP[densityKey in DENSITY_SPACE_MAP ? densityKey : 'comfortable']
  const typeface = resolveTypeface(appearance.typeface)
  const stacks = TYPEFACE_STACKS[typeface]

  el.style.removeProperty('zoom')
  el.style.setProperty('--ui-scale', String(scaleToFactor(scale)))
  el.style.setProperty('--font-scale', String(fontScale))
  el.style.setProperty('--density-space', String(densitySpace))
  el.style.setProperty('--font-sans', stacks.sans)
  el.style.setProperty('--font-mono', stacks.mono)
  el.dataset.typeface = typeface

  if (appearance.theme) {
    el.dataset.theme = appearance.theme
    el.style.colorScheme = appearance.theme === 'light' ? 'light' : 'dark'
    applyFaviconForTheme(appearance.theme, el.ownerDocument)
  }

  if (appearance.reduceMotion !== undefined) {
    el.dataset.reduceMotion = String(appearance.reduceMotion)
  }
}
