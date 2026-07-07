import { cn } from '../../lib/utils'
import { useSettingsStore, type Theme } from '../../stores/settings-store'
import { PALETTES, THEME_ORDER } from '../../lib/theme-palettes'

export function ThemeSwatches() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex flex-wrap gap-2">
      {THEME_ORDER.map((key) => {
        const p = PALETTES[key]
        const active = theme === key
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(key as Theme)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-3 w-[140px] text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
              active
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                : 'border-[var(--color-border-soft)] hover:border-[var(--color-border-strong)]',
            )}
          >
            <div className="flex w-full h-10 rounded-md overflow-hidden border border-[var(--color-border-faint)]">
              <span className="flex-1" style={{ background: p.bgBase }} />
              <span className="flex-1" style={{ background: p.bgRaised }} />
              <span className="flex-1" style={{ background: p.accent }} />
            </div>
            <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}
