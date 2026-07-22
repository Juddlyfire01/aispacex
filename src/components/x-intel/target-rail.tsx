import { useCallback, useState } from 'react'
import { useXIntelStore } from '../../stores/x-intel-store'
import { runGather } from '../../lib/x-intel/orchestrate'
import { confirmDialog } from '../../stores/confirm-store'
import { useListDragReorder } from '../../hooks/use-list-drag-reorder'
import { RailDropIndicator } from './rail-drop-indicator'
import { CostMeter } from './cost-meter'
import { RailAddMenu } from './rail-add-menu'
import { RailFilterMenu } from './rail-filter-menu'
import { RailSortMenu, type RailSortKey } from './rail-sort-menu'
import { AffiliatesModal } from './affiliates-modal'
import { SharedLibrarySection } from './shared-library-section'
import { RailMetaFlip } from './rail-meta-flip'
import { ensureProfileShape } from '../../lib/x-intel/normalize'
import { useSharedLibraryStore } from '../../stores/shared-library-store'
import { cn } from '../../lib/utils'
import { useX402Store } from '../../stores/x402-store'
import { X402_ENABLED } from '../../lib/x402/config'

function relativeTime(iso: string | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function TargetRail() {
  const { targets, reports, activeTarget, setActiveTarget, addTarget, removeTarget, reorderTargets, gatheringTargets } = useXIntelStore()
  const address = useX402Store((s) => s.address)
  const status = useX402Store((s) => s.status)
  const creditsWallet = X402_ENABLED && status === 'connected' && Boolean(address)
  const chargedByTarget = useX402Store((s) => s.chargedByTarget)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [officialOnly, setOfficialOnly] = useState(false)
  const [sortKey, setSortKey] = useState<RailSortKey>('manual')
  const [affiliatesOpen, setAffiliatesOpen] = useState(false)

  // Org-affiliation badge for a target, if its gathered profile carries one.
  const affiliationOf = (username: string) => {
    const profile = reports[username]?.profile
    return profile ? ensureProfileShape(profile).affiliation : null
  }

  const affiliatedCount = targets.filter((t) => affiliationOf(t)).length

  // Manual keeps the drag order; other keys derive order from report data.
  // Sorting is a stable copy so it never mutates the store's target order.
  const sortComparator = (a: string, b: string): number => {
    switch (sortKey) {
      case 'followers':
        return (reports[b]?.profile?.metrics.followers ?? -1) - (reports[a]?.profile?.metrics.followers ?? -1)
      case 'cost': {
        // Credits wallet: sort by credits charged for that target, not raw API spend.
        if (creditsWallet) {
          const ca = chargedByTarget[a.toLowerCase()] ?? 0
          const cb = chargedByTarget[b.toLowerCase()] ?? 0
          return cb - ca
        }
        return (reports[b]?.totalCost ?? 0) - (reports[a]?.totalCost ?? 0)
      }
      case 'name':
        return a.toLowerCase().localeCompare(b.toLowerCase())
      case 'recent': {
        const at = reports[a]?.refreshedAt?.profile ?? reports[a]?.profile?.gatheredAt ?? ''
        const bt = reports[b]?.refreshedAt?.profile ?? reports[b]?.profile?.gatheredAt ?? ''
        return bt.localeCompare(at)
      }
      default:
        return 0
    }
  }

  const filteredTargets = officialOnly ? targets.filter((t) => affiliationOf(t)) : targets
  const isManual = sortKey === 'manual'
  const visibleTargets = isManual ? filteredTargets : [...filteredTargets].sort(sortComparator)

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      reorderTargets(fromIndex, toIndex)
    },
    [reorderTargets],
  )
  const { getItemProps, draggingIndex, showDropSlot } = useListDragReorder(targets.length, handleReorder)

  // Shared row renderer. In manual mode `drag` carries the drag handlers + drop
  // slots; in sorted mode it's null and rows are static.
  const renderRow = (
    t: string,
    drag: { props: Record<string, unknown>; isDragging: boolean; index: number } | null,
  ) => {
    const report = reports[t]
    const affiliation = affiliationOf(t)
    const isLast = drag != null && drag.index === targets.length - 1
    return (
      <div
        key={t}
        {...(drag?.props ?? {})}
        title={drag ? 'Drag to reorder' : undefined}
        className={cn(
          'group relative flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[11px] transition-colors',
          drag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          t === activeTarget
            ? 'text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)]',
          drag?.isDragging && 'opacity-40',
        )}
        onClick={() => setActiveTarget(t)}
      >
        {drag && showDropSlot(drag.index) && <RailDropIndicator edge="before" />}
        {isLast && showDropSlot(targets.length) && <RailDropIndicator edge="after" />}
        {t === activeTarget && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-[var(--color-accent)]" />
        )}
        {report?.profile?.avatarUrl ? (
          <img src={report.profile.avatarUrl} alt="" className="w-4 h-4 rounded-full shrink-0 pointer-events-none" draggable={false} />
        ) : (
          <div className="w-4 h-4 rounded-full bg-[var(--color-bg-surface)] shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <span className="truncate">@{t}</span>
            <RailMetaFlip
              affiliation={affiliation}
              cost={report?.totalCost ?? 0}
              username={t}
              active={t === activeTarget}
            />
          </div>
          <div className="text-[9px] text-[var(--color-text-tertiary)]">
            {gatheringTargets[t]
              ? 'updating…'
              : relativeTime(report?.refreshedAt?.profile ?? report?.profile?.gatheredAt)}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleRemove(t) }}
          title="Remove profile"
          className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-all shrink-0 p-0.5"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    )
  }

  const handleRemove = async (username: string) => {
    const ok = await confirmDialog({
      title: 'Remove from rail',
      description: `@${username} · Gathered data stays encrypted on this device and is revived if you add them again.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    removeTarget(username)
  }

  const gather = async (username: string) => {
    setError(null)
    try {
      await runGather(username)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gather failed')
    }
  }

  const handleAdd = async () => {
    const name = input.trim().replace(/^@/, '')
    if (!name) return
    setInput('')
    // Prefer a free shared-library pull when this handle is already gathered by
    // someone else; only fall back to a live X gather when it isn't.
    const sharedMatch = useSharedLibraryStore
      .getState()
      .entries.find((e) => e.username.toLowerCase() === name.toLowerCase())
    if (sharedMatch) {
      await handleSelectShared(sharedMatch.username)
      return
    }
    addTarget(name)
    // addTarget may revive a differently-cased cached key (e.g. askvenice → AskVenice).
    const resolved = useXIntelStore.getState().activeTarget
    if (resolved) await gather(resolved)
  }

  // Pull a shared bundle into the local store (free + instant), then add it to
  // the rail and activate it. Falls back to a live gather only if the pull found
  // no usable profile. Shared by the Add field submit + the type-ahead picks.
  const handleSelectShared = async (username: string) => {
    setInput('')
    const pulled = await useSharedLibraryStore.getState().pull(username)
    addTarget(username)
    const resolved = useXIntelStore.getState().activeTarget ?? username
    setActiveTarget(resolved)
    if (!pulled && !useXIntelStore.getState().reports[resolved]?.profile) {
      await gather(resolved)
    }
  }

  return (
    <div className="w-52 shrink-0 border-r border-[var(--color-border-faint)] bg-[var(--color-bg-base)] flex flex-col h-full min-h-0">
      <div className="p-2 space-y-1.5">
        {/* Primary add control (Add-profile field + Org affiliates launcher)
            with a secondary Filter control stacked beneath it. Demo targets
            (e.g. @AskVenice) work offline; gather enforces OAuth for others. */}
        <RailAddMenu
          value={input}
          onChange={setInput}
          onSubmit={handleAdd}
          onOpenAffiliates={() => setAffiliatesOpen(true)}
          onSelectShared={handleSelectShared}
          railUsernames={targets}
          error={error}
        />
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <RailFilterMenu
              officialOnly={officialOnly}
              onToggleOfficial={() => setOfficialOnly((v) => !v)}
              affiliatedCount={affiliatedCount}
            />
          </div>
          <div className="flex-1 min-w-0">
            <RailSortMenu sortKey={sortKey} onChange={setSortKey} />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2">
        {targets.length === 0 ? (
          <div className="px-2 py-5 text-[11px] text-[var(--color-text-tertiary)] text-center">
            Add a profile to start gathering intel
            <div className="mt-2 text-[var(--color-text-quaternary)]">e.g. ErikVoorhees · venice_ai</div>
          </div>
        ) : visibleTargets.length === 0 ? (
          <div className="px-2 py-5 text-[11px] text-[var(--color-text-tertiary)] text-center">
            No affiliated accounts gathered yet
          </div>
        ) : isManual ? (
          // Manual: map over the full array so drag indices stay stable; hide
          // filtered-out rows without collapsing the drag order.
          targets.map((t, index) => {
            if (officialOnly && !affiliationOf(t)) return null
            const dragProps = getItemProps(index)
            return renderRow(t, { props: dragProps, isDragging: draggingIndex === index, index })
          })
        ) : (
          // Sorted: derived order, drag disabled.
          visibleTargets.map((t) => renderRow(t, null))
        )}

        {/* Profiles others have gathered but this device hasn't pulled yet. */}
        <SharedLibrarySection />
      </div>

      <CostMeter />
      <AffiliatesModal open={affiliatesOpen} onClose={() => setAffiliatesOpen(false)} />
    </div>
  )
}
