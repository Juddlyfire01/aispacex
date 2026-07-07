import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settings-store'
import { applyAppearanceToHtml } from '../lib/appearance'

export function useApplyAppearance() {
  const theme = useSettingsStore((s) => s.theme)
  const scale = useSettingsStore((s) => s.scale)
  const fontScale = useSettingsStore((s) => s.fontScale)
  const reduceMotion = useSettingsStore((s) => s.reduceMotion)
  const density = useSettingsStore((s) => s.density)

  useEffect(() => {
    applyAppearanceToHtml(document.documentElement, {
      theme,
      scale,
      fontScale,
      density,
      reduceMotion,
    })
    document.documentElement.dataset.density = density
    document.documentElement.dataset.reduceMotion = String(reduceMotion)
  }, [theme, scale, fontScale, reduceMotion, density])
}
