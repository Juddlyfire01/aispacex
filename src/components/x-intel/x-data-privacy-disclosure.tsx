import { useSettingsStore } from '../../stores/settings-store'
import { cn } from '../../lib/utils'

const BULLETS = [
  'Connecting loads your profile, posts, bookmarks, and likes.',
  'In Intel → Others, any @username you add is fetched and cached here too.',
  'Venice.ai processes post text for AI reports — nothing is stored there.',
  'Disconnect or clear cached data anytime in Settings.',
] as const

const LEAD =
  'Your data stays here. When you connect X, profile and posts are cached encrypted on this device — not on our servers. AI reports send post text to Venice.ai for analysis only. Disconnect or clear everything anytime in Settings.'

/** Collapsible privacy copy for the Intel connect empty state. */
export function XDataPrivacyDisclosure({ className }: { className?: string }) {
  const openSettings = useSettingsStore((s) => s.openSettings)

  return (
    <details className={cn('group relative w-full text-left', className)}>
      <summary className="list-none cursor-pointer text-[11px] text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] transition-colors select-none text-center whitespace-nowrap [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1">
          How we handle your data
          <svg
            className="h-3 w-3 transition-transform group-open:rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </summary>
      <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-overlay)] px-3 py-2.5 shadow-lg">
        <p className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">{LEAD}</p>
        <ul className="mt-2.5 space-y-1.5 text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
          {BULLETS.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="text-[var(--color-text-quaternary)] shrink-0">·</span>
              <span>{line}</span>
            </li>
          ))}
          <li className="pt-1">
            <button
              type="button"
              onClick={() => openSettings('data')}
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] underline underline-offset-2 transition-colors"
            >
              Open Settings → Data &amp; privacy
            </button>
          </li>
        </ul>
      </div>
    </details>
  )
}
