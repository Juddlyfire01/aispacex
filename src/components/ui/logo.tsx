import { cn } from '../../lib/utils'
import { useSettingsStore } from '../../stores/settings-store'
import { faviconHrefForTheme } from '../../lib/appearance'

export function AppLogo({ className, size = 24 }: { className?: string; size?: number }) {
  const theme = useSettingsStore((s) => s.theme)

  return (
    <img
      src={faviconHrefForTheme(theme)}
      alt=""
      aria-hidden
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
    />
  )
}

export function AppWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]', className)}>
      AiSpaceX
    </span>
  )
}
