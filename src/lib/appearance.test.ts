import { describe, it, expect } from 'vitest'
import { applyAppearanceToHtml, faviconHrefForTheme, scaleToFactor } from './appearance'

describe('appearance', () => {
  it('scaleToFactor converts percent steps to a multiplier', () => {
    expect(scaleToFactor(100)).toBe(1)
    expect(scaleToFactor(125)).toBe(1.25)
    expect(scaleToFactor(90)).toBe(0.9)
  })

  it('faviconHrefForTheme maps themes to logo variants', () => {
    expect(faviconHrefForTheme('light')).toBe('/logo-dark.svg?v=10')
    expect(faviconHrefForTheme('venice')).toBe('/logo-dark.svg?v=10')
    expect(faviconHrefForTheme('dark')).toBe('/logo-dark.svg?v=10')
    expect(faviconHrefForTheme('grey')).toBe('/logo-dark.svg?v=10')
  })

  it('applyAppearanceToHtml maps legacy zoom to ui-scale', () => {
    const style = new Map<string, string>()
    const el = {
      style: {
        setProperty: (k: string, v: string) => style.set(k, v),
        removeProperty: (k: string) => { style.delete(k); return '' },
        get zoom() { return style.get('zoom') ?? '' },
        set zoom(_v: string) { /* noop */ },
      },
      dataset: {} as DOMStringMap,
    } as unknown as HTMLElement

    applyAppearanceToHtml(el, { zoom: 110, fontScale: 'lg', density: 'compact' })
    expect(style.get('--ui-scale')).toBe(String(1.1))
    expect(style.get('--font-scale')).toBe('1.12')
    expect(style.get('--density-space')).toBe('0.82')
  })
})
