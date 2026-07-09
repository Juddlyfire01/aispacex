import { describe, it, expect } from 'vitest'
import {
  applyAppearanceToHtml,
  faviconHrefForTheme,
  aispaceLogoHrefForTheme,
  veniceKeysLogoHrefForTheme,
  xLogoHrefForTheme,
  scaleToFactor,
} from './appearance'

describe('appearance', () => {
  it('scaleToFactor converts percent steps to a multiplier', () => {
    expect(scaleToFactor(100)).toBe(1)
    expect(scaleToFactor(125)).toBe(1.25)
    expect(scaleToFactor(90)).toBe(0.9)
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

    applyAppearanceToHtml(el, { zoom: 110, fontScale: 'lg', density: 'compact' })
    expect(style.get('--ui-scale')).toBe(String(1.1))
    expect(style.get('--font-scale')).toBe('1.12')
    expect(style.get('--density-space')).toBe('0.82')
  })
})
