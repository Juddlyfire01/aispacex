import { describe, it, expect } from 'vitest'
import {
  applyAppearanceToHtml,
  faviconHrefForTheme,
  aispaceLogoHrefForTheme,
  veniceKeysLogoHrefForTheme,
  xLogoHrefForTheme,
  scaleToFactor,
  resolveTypeface,
  resolveSurfaceEmphasis,
  TYPEFACE_STACKS,
  DEFAULT_TYPEFACE,
  FONT_SCALE_MAP,
} from './appearance'

describe('appearance', () => {
  it('scaleToFactor converts percent steps to a multiplier', () => {
    expect(scaleToFactor(100)).toBe(1)
    expect(scaleToFactor(125)).toBe(1.25)
    expect(scaleToFactor(90)).toBe(0.9)
  })

  it('resolveTypeface defaults to aispace and accepts known ids', () => {
    expect(resolveTypeface(undefined)).toBe(DEFAULT_TYPEFACE)
    expect(resolveTypeface('nope')).toBe('aispace')
    expect(resolveTypeface('dossier')).toBe('dossier')
    expect(TYPEFACE_STACKS.aispace.sans).toContain('Space Grotesk')
  })

  it('aispaceLogoHrefForTheme maps light/dark app key', () => {
    expect(aispaceLogoHrefForTheme('light')).toBe('/aispace-logo-light.svg')
    expect(aispaceLogoHrefForTheme('dark')).toBe('/aispace-logo-dark.svg')
    expect(aispaceLogoHrefForTheme('venice')).toBe('/aispace-logo-dark.svg')
    expect(aispaceLogoHrefForTheme('grey')).toBe('/aispace-logo-dark.svg')
  })

  it('veniceKeysLogoHrefForTheme maps light/dark Venice keys', () => {
    expect(veniceKeysLogoHrefForTheme('light')).toBe('/venice-keys-logo-light.svg')
    expect(veniceKeysLogoHrefForTheme('dark')).toBe('/venice-keys-logo-dark.svg')
    expect(veniceKeysLogoHrefForTheme('venice')).toBe('/venice-keys-logo-dark.svg')
  })

  it('faviconHrefForTheme versions the AiSpace key', () => {
    expect(faviconHrefForTheme('light')).toBe('/aispace-logo-light.svg?v=12')
    expect(faviconHrefForTheme('dark')).toBe('/aispace-logo-dark.svg?v=12')
  })

  it('xLogoHrefForTheme maps light/dark X mark', () => {
    expect(xLogoHrefForTheme('light')).toBe('/x-logo-light.svg')
    expect(xLogoHrefForTheme('dark')).toBe('/x-logo-dark.svg')
    expect(xLogoHrefForTheme('venice')).toBe('/x-logo-dark.svg')
  })

  it('applyAppearanceToHtml maps legacy zoom to ui-scale', () => {
    const style = new Map<string, string>()
    const el = {
      style: {
        setProperty: (k: string, v: string) => style.set(k, v),
        removeProperty: (k: string) => {
          style.delete(k)
          return ''
        },
        get zoom() {
          return style.get('zoom') ?? ''
        },
        set zoom(_v: string) {
          /* noop */
        },
      },
      dataset: {} as DOMStringMap,
    } as unknown as HTMLElement

    applyAppearanceToHtml(el, { zoom: 110, fontScale: 'lg', density: 'compact', typeface: 'x' })
    expect(style.get('--ui-scale')).toBe(String(1.1))
    expect(style.get('--font-scale')).toBe('1.25')
    expect(style.get('--density-space')).toBe('0.82')
    expect(style.get('--font-sans')).toBe(TYPEFACE_STACKS.x.sans)
    expect(style.get('--font-mono')).toBe(TYPEFACE_STACKS.x.mono)
    expect((el as HTMLElement).dataset.typeface).toBe('x')
    expect((el as HTMLElement).dataset.surface).toBe('quiet')
  })

  it('resolveSurfaceEmphasis defaults to quiet', () => {
    expect(resolveSurfaceEmphasis(undefined)).toBe('quiet')
    expect(resolveSurfaceEmphasis('strong')).toBe('strong')
    expect(resolveSurfaceEmphasis('nope')).toBe('quiet')
  })

  it('applyAppearanceToHtml sets data-surface for raised cards', () => {
    const style = new Map<string, string>()
    const el = {
      style: {
        setProperty: (k: string, v: string) => style.set(k, v),
        removeProperty: (k: string) => {
          style.delete(k)
          return ''
        },
      },
      dataset: {} as DOMStringMap,
    } as unknown as HTMLElement

    applyAppearanceToHtml(el, { surfaceEmphasis: 'strong', typeface: 'aispace' })
    expect((el as HTMLElement).dataset.surface).toBe('strong')
  })

  it('Medium font scale is at or above X default body sizing', () => {
    // X default post body ≈ 15–16px. Medium multiplies base 15px by 1.1 → 16.5px.
    expect(FONT_SCALE_MAP.md).toBeGreaterThanOrEqual(1.1)
    expect(15 * FONT_SCALE_MAP.md).toBeGreaterThanOrEqual(16)
    expect(FONT_SCALE_MAP.sm).toBeLessThan(FONT_SCALE_MAP.md)
    expect(FONT_SCALE_MAP.md).toBeLessThan(FONT_SCALE_MAP.lg)
  })
})
