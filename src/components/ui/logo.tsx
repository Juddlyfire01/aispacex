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
      IntelX
    </span>
  )
}

/** Logo + product name for expanded chrome (sidebar, empty states). */
export function AppBrand({
  className,
  logoSize = 20,
  wordmarkClassName,
}: {
  className?: string
  logoSize?: number
  wordmarkClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 min-w-0', className)}>
      <AppLogo size={logoSize} className="shrink-0" />
      <AppWordmark className={cn('text-[14px] truncate', wordmarkClassName)} />
    </span>
  )
}
