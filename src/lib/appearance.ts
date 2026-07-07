export const SCALE_STEPS = [90, 100, 110, 125] as const
export type Scale = (typeof SCALE_STEPS)[number]

export const FONT_SCALE_MAP = { sm: 0.9, md: 1, lg: 1.12 } as const
export type FontScale = keyof typeof FONT_SCALE_MAP

export const DENSITY_SPACE_MAP = { compact: 0.82, comfortable: 1 } as const
export type Density = keyof typeof DENSITY_SPACE_MAP

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
  density?: Density | string
  reduceMotion?: boolean
}

export const FAVICON_VERSION = '10'

export function faviconHrefForTheme(_theme: string): string {
  return `/logo-dark.svg?v=${FAVICON_VERSION}`
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

  el.style.removeProperty('zoom')
  el.style.setProperty('--ui-scale', String(scaleToFactor(scale)))
  el.style.setProperty('--font-scale', String(fontScale))
  el.style.setProperty('--density-space', String(densitySpace))

  if (appearance.theme) {
    el.dataset.theme = appearance.theme
    el.style.colorScheme = appearance.theme === 'light' ? 'light' : 'dark'
    applyFaviconForTheme(appearance.theme, el.ownerDocument)
  }

  if (appearance.reduceMotion) {
    el.dataset.reduceMotion = String(appearance.reduceMotion)
  }
}
