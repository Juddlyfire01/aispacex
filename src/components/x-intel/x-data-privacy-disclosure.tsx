import { useSettingsStore } from '../../stores/settings-store'
import { cn } from '../../lib/utils'

const BULLETS = [
  'Your access token stays on the server — never exposed to the browser.',
  'Gathered data is encrypted at rest on this device.',
  'Disconnect anytime; clear cached data permanently when you choose.',
  'Connect multiple accounts and switch between them from the left rail.',
] as const

/** Collapsible privacy copy for the Intel connect empty state (Option B). */
export function XDataPrivacyDisclosure({ className }: { className?: string }) {
  const openSettings = useSettingsStore((s) => s.openSettings)

  return (
    <details className={cn('group max-w-sm text-left', className)}>
      <summary className="list-none cursor-pointer text-[11px] text-white/35 hover:text-white/55 transition-colors select-none [&::-webkit-details-marker]:hidden">
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
      <ul className="mt-2.5 space-y-1.5 text-[11px] text-white/40 leading-relaxed pl-0.5">
        {BULLETS.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-white/20 shrink-0">·</span>
            <span>{line}</span>
          </li>
        ))}
        <li className="pt-1">
          <button
            type="button"
            onClick={() => openSettings('data')}
            className="text-white/50 hover:text-white/70 underline underline-offset-2 transition-colors"
          >
            Manage in Settings → Data &amp; privacy
          </button>
        </li>
      </ul>
    </details>
  )
}
