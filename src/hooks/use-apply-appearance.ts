import { useEffect, useState } from 'react'
import { useSettingsStore } from '../stores/settings-store'
import { applyAppearanceToHtml } from '../lib/appearance'
import { writeAppearanceSnapshot } from '../lib/appearance-persist'

/**
 * Apply theme/scale to <html> and mirror non-sensitive prefs to plaintext
 * storage for the FOUC boot script.
 *
 * Waits for zustand persist hydration first. Without that, the store's
 * DEFAULT_THEME ('dark') would overwrite a correct first paint from
 * appearance-boot.js, then flip again once encrypted settings rehydrate —
 * the classic dark-theme flash on refresh / OAuth return.
 */
export function useApplyAppearance() {
  const theme = useSettingsStore((s) => s.theme)
  const scale = useSettingsStore((s) => s.scale)
  const fontScale = useSettingsStore((s) => s.fontScale)
  const typeface = useSettingsStore((s) => s.typeface)
  const reduceMotion = useSettingsStore((s) => s.reduceMotion)
  const density = useSettingsStore((s) => s.density)
  const [hydrated, setHydrated] = useState(() => useSettingsStore.persist.hasHydrated())

  useEffect(() => {
    if (hydrated) return
    const unsub = useSettingsStore.persist.onFinishHydration(() => setHydrated(true))
    if (useSettingsStore.persist.hasHydrated()) setHydrated(true)
    return unsub
  }, [hydrated])

  useEffect(() => {
    if (!hydrated) return
    const appearance = { theme, scale, fontScale, typeface, density, reduceMotion }
    applyAppearanceToHtml(document.documentElement, appearance)
    document.documentElement.dataset.density = density
    document.documentElement.dataset.reduceMotion = String(reduceMotion)
    writeAppearanceSnapshot(appearance)
  }, [hydrated, theme, scale, fontScale, typeface, reduceMotion, density])
}
