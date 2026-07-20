import { useMemo, useState } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useSharedLibraryStore } from '../../stores/shared-library-store'
import { runGather } from '../../lib/x-intel/orchestrate'
import type { Affiliation } from '../../lib/x-intel/types'
import { RailMetaFlip } from './rail-meta-flip'
import { cn } from '../../lib/utils'

function affiliationFromEntry(e: {
  affiliationBadgeUrl?: string | null
  affiliationLabel?: string | null
}): Affiliation | null {
  if (!e.affiliationBadgeUrl) return null
  return {
    badgeUrl: e.affiliationBadgeUrl,
    description: e.affiliationLabel ?? null,
    url: null,
    org: e.affiliationLabel
      ? { id: '', username: '', name: e.affiliationLabel }
      : null,
  }
}

/**
 * Collapsible "Shared library" section for the Others rail. Lists profiles that
 * exist in the shared KV library but are NOT yet on this device's rail
 * (state: available). Clicking one lazily downloads its bundle into the local
 * store (state: pulling), then adds it to the rail and activates it (state:
 * added → active). Profiles already on the rail are filtered out here — they
 * render in the main rail list with the normal added/active styling.
 *
 * Renders nothing when the library is empty (e.g. KV unconfigured) so the rail
 * is visually unchanged in that environment.
 */
export function SharedLibrarySection() {
  const entries = useSharedLibraryStore((s) => s.entries)
  const loaded = useSharedLibraryStore((s) => s.loaded)
  const pulling = useSharedLibraryStore((s) => s.pulling)
  const pull = useSharedLibraryStore((s) => s.pull)

  const targets = useXIntelStore((s) => s.targets)
  const reports = useXIntelStore((s) => s.reports)
  const addTarget = useXIntelStore((s) => s.addTarget)
  const setActiveTarget = useXIntelStore((s) => s.setActiveTarget)

  const [open, setOpen] = useState(true)

  // Available = in the shared index but not already on the rail.
  const railSet = useMemo(() => new Set(targets.map((t) => t.toLowerCase())), [targets])
  const available = useMemo(
    () => entries.filter((e) => !railSet.has(e.username.toLowerCase())),
    [entries, railSet],
  )

  if (!loaded || available.length === 0) return null

  const handleAdd = async (username: string) => {
    const lower = username.toLowerCase()
    if (pulling[lower]) return
    // Download the shared bundle into the local store first (free + instant),
    // then surface it on the rail. If the pull misses (bundle vanished), fall
    // back to a live gather so the click still does something useful.
    const pulled = await pull(username)
    addTarget(username)
    const resolved = useXIntelStore.getState().activeTarget ?? username
    setActiveTarget(resolved)
    if (!pulled && !reports[resolved]?.profile) {
      runGather(resolved).catch(() => { /* surfaced on manual gather */ })
    }
  }

  return (
    <div className="mt-2 border-t border-[var(--color-border-faint)] pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        aria-expanded={open}
      >
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          className={cn('transition-transform', open ? 'rotate-0' : '-rotate-90')}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        Shared library
        <span className="ml-auto font-mono tabular-nums text-[var(--color-text-quaternary)]">
          {available.length}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-0.5 mt-1">
          {available.map((e) => {
            const isPulling = Boolean(pulling[e.username.toLowerCase()])
            const affiliation = affiliationFromEntry(e)
            return (
              <button
                key={e.username}
                type="button"
                onClick={() => handleAdd(e.username)}
                disabled={isPulling}
                title={`Add @${e.username} from the shared library`}
                className="group relative flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)] transition-colors text-left disabled:opacity-60"
              >
                {e.avatarUrl ? (
                  <img src={e.avatarUrl} alt="" className="w-4 h-4 rounded-full shrink-0 opacity-70 group-hover:opacity-100" draggable={false} />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-[var(--color-bg-surface)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span className="truncate">@{e.username}</span>
                    {!isPulling && (
                      <RailMetaFlip
                        affiliation={affiliation}
                        cost={0}
                        username={e.username}
                      />
                    )}
                  </div>
                  <div className="text-[9px] text-[var(--color-text-quaternary)]">
                    {isPulling
                      ? 'downloading…'
                      : `${e.postCount} post${e.postCount === 1 ? '' : 's'}${e.reportCount ? ` · ${e.reportCount} report${e.reportCount === 1 ? '' : 's'}` : ''}`}
                  </div>
                </div>
                {isPulling ? (
                  <svg className="w-3 h-3 shrink-0 animate-spin text-[var(--color-text-tertiary)]" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg
                    className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-70 transition-opacity"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
