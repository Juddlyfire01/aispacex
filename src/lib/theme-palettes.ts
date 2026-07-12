export interface Palette {
  name: string
  bgBase: string
  bgRaised: string
  bgInput: string
  bgOverlay: string
  borderFaint: string
  borderSoft: string
  borderStrong: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  accent: string
  accentSoft: string
  accentContrast: string
  colorScheme: 'dark' | 'light'
}

export const PALETTES: Record<string, Palette> = {
  dark: {
    name: 'Dark',
    /* X Lights Out — current default dark (brand-atoms / product UI, not Dim navy) */
    bgBase: '#000000',
    bgRaised: '#16181C',
    bgInput: '#000000',
    bgOverlay: '#1E2732',
    borderFaint: 'rgba(47, 51, 54, 0.65)',
    borderSoft: '#2F3336',
    borderStrong: '#536471',
    textPrimary: '#E7E9EA',
    textSecondary: '#71767B',
    textTertiary: '#536471',
    accent: '#ffffff',
    accentSoft: 'rgba(255, 255, 255, 0.14)',
    accentContrast: '#000000',
    colorScheme: 'dark',
  },
  venice: {
    name: 'Venice',
    bgBase: '#080F16',
    bgRaised: '#0A121A',
    bgInput: '#0A121A',
    bgOverlay: '#0E2942',
    borderFaint: 'rgba(247,245,237,0.05)',
    borderSoft: 'rgba(247,245,237,0.08)',
    borderStrong: 'rgba(247,245,237,0.14)',
    textPrimary: 'rgba(247,245,237,0.88)',
    textSecondary: 'rgba(247,245,237,0.62)',
    textTertiary: 'rgba(247,245,237,0.40)',
    accent: '#3C8FDD',
    accentSoft: 'rgba(60,143,221,0.18)',
    accentContrast: '#ffffff',
    colorScheme: 'dark',
  },
  grey: {
    name: 'Grey',
    bgBase: '#181818',
    bgRaised: '#1f1f1f',
    bgInput: '#141414',
    bgOverlay: '#232323',
    borderFaint: 'rgba(255,255,255,0.06)',
    borderSoft: '#2b2b2b',
    borderStrong: '#3c3c3c',
    textPrimary: '#cccccc',
    textSecondary: 'rgba(204,204,204,0.75)',
    textTertiary: 'rgba(204,204,204,0.5)',
    accent: '#4aa3ff',
    accentSoft: 'rgba(74,163,255,0.16)',
    accentContrast: '#03121f',
    colorScheme: 'dark',
  },
  light: {
    name: 'Light',
    bgBase: '#f4f4f2',
    bgRaised: '#fbfbfa',
    bgInput: '#ecebe8',
    bgOverlay: '#ffffff',
    borderFaint: 'rgba(0,0,0,0.06)',
    borderSoft: 'rgba(0,0,0,0.10)',
    borderStrong: 'rgba(0,0,0,0.18)',
    textPrimary: 'rgba(20,22,28,0.92)',
    textSecondary: 'rgba(20,22,28,0.62)',
    textTertiary: 'rgba(20,22,28,0.42)',
    accent: '#0f9a84',
    accentSoft: 'rgba(15,154,132,0.14)',
    accentContrast: '#ffffff',
    colorScheme: 'light',
  },
}

export const DEFAULT_THEME = 'dark' as const
export const THEME_ORDER = ['venice', 'dark', 'grey', 'light'] as const
export type ThemeKey = (typeof THEME_ORDER)[number]
