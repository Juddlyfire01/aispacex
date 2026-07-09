import { Spinner } from '../ui/spinner'

export type XConnectPhase = 'authorizing' | 'syncing'

/**
 * Shared OAuth / first-sync loading shell — used by SelfProfileView and as the
 * Intel Suspense fallback on OAuth return so the handoff never flashes a
 * different spinner style or "Loading intel…" label.
 */
export function XConnectFlow({
  phase,
  busy,
  error,
  onRetry,
}: {
  phase: XConnectPhase
  busy?: boolean
  error?: string | null
  onRetry?: () => void
}) {
  const title = phase === 'authorizing' ? 'Connecting to X…' : 'Syncing your profile…'
  const subtitle =
    phase === 'authorizing'
      ? 'Authorizing your account with X. You’ll be back here in a moment.'
      : 'Fetching your profile, posts, bookmarks & likes.'

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
      <Spinner size="md" />
      <div className="space-y-1 max-w-sm">
        <h2 className="text-[15px] font-semibold text-white/85">{title}</h2>
        <p className="text-[12px] text-white/40 leading-relaxed">{subtitle}</p>
      </div>
      {phase === 'syncing' && error && (
        <div className="space-y-2 max-w-sm">
          <p className="text-[11px] text-red-400/70">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="px-3 py-1.5 text-[12px] font-medium bg-white text-black rounded-md hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Retrying…' : 'Retry gather'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
