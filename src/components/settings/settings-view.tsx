import { useEffect, useMemo } from 'react'
import { cn } from '../../lib/utils'
import { useSettingsStore, type SettingsCategory } from '../../stores/settings-store'
import { X402_ENABLED } from '../../lib/x402/config'
import { ProfileSection } from './profile-section'
import { DisplaySection } from './display-section'
import { DataPrivacySection } from './data-privacy-section'
import { BillingSection } from './billing-section'
import { UsageSection } from './usage-section'

type Category = SettingsCategory

const BASE_CATEGORIES: Array<{ id: Category; label: string; desc: string }> = [
  { id: 'profile', label: 'Profile', desc: 'Your display identity' },
  { id: 'display', label: 'Display', desc: 'Theme, scale, and density' },
  { id: 'data', label: 'Data & privacy', desc: 'Manage & clear cached data' },
]

const BILLING_CATEGORY = {
  id: 'billing' as const,
  label: 'Billing',
  desc: 'Credits and payments',
}

const USAGE_CATEGORY = {
  id: 'usage' as const,
  label: 'Usage',
  desc: 'Analytics and breakdown',
}

function resolveCategory(
  cat: Category,
  available: ReadonlyArray<{ id: Category }>,
): Category {
  if (available.some((c) => c.id === cat)) return cat
  return 'display'
}

export function SettingsView() {
  const settingsFocus = useSettingsStore((s) => s.settingsFocus)
  const settingsCategory = useSettingsStore((s) => s.settingsCategory)
  const setSettingsCategory = useSettingsStore((s) => s.setSettingsCategory)
  const closeSettings = useSettingsStore((s) => s.closeSettings)

  const categories = useMemo(
    () =>
      X402_ENABLED
        ? [...BASE_CATEGORIES, BILLING_CATEGORY, USAGE_CATEGORY]
        : BASE_CATEGORIES,
    [],
  )

  const cat = resolveCategory(settingsCategory, categories)

  useEffect(() => {
    // If persisted category is unavailable (e.g. billing with x402 off), snap back.
    if (cat !== settingsCategory) setSettingsCategory(cat)
  }, [cat, settingsCategory, setSettingsCategory])

  useEffect(() => {
    if (!settingsFocus) return
    if (
      (settingsFocus === 'billing' || settingsFocus === 'usage') &&
      !X402_ENABLED
    ) {
      useSettingsStore.setState({ settingsFocus: null })
      return
    }
    setSettingsCategory(settingsFocus)
    useSettingsStore.setState({ settingsFocus: null })
  }, [settingsFocus, setSettingsCategory])

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)] flex flex-col">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-[var(--color-border-faint)]">
          <button
            type="button"
            onClick={closeSettings}
            aria-label="Back"
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors p-1 -ml-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">Settings</span>
        </div>
        <nav className="flex flex-col gap-px p-2">
          {categories.map((c) => {
            const active = cat === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSettingsCategory(c.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
                  active
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-[var(--color-accent)]" />
                )}
                <span className="text-[14px] font-medium">{c.label}</span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">{c.desc}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div
          className={cn(
            'px-8 py-8',
            cat === 'usage' ? 'max-w-4xl' : 'max-w-2xl',
          )}
        >
          <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)] mb-6">
            {categories.find((c) => c.id === cat)?.label}
          </h2>
          {cat === 'profile' ? (
            <ProfileSection />
          ) : cat === 'data' ? (
            <DataPrivacySection />
          ) : cat === 'billing' ? (
            <BillingSection />
          ) : cat === 'usage' ? (
            <UsageSection />
          ) : (
            <DisplaySection />
          )}
        </div>
      </div>
    </div>
  )
}
