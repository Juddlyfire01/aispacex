import { useEffect, useId, useMemo, useState } from 'react'
import { Modal } from '../ui/modal'
import { useXAffiliatesStore, VENICE_ORG, orgKey, type AffiliateRoster } from '../../stores/x-affiliates-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { refreshAffiliates, type AffiliateOrg } from '../../lib/x-intel/affiliates'
import { addTargetWithToast, addTargetsWithToast } from '../../lib/x-intel/add-target'
import { AffiliationBadge } from './verified-badge'
import { formatTokens, cn } from '../../lib/utils'
import type { Profile } from '../../lib/x-intel/types'

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

function AffiliateRow({ member, onAdd }: { member: Profile; onAdd: (member: Profile) => void }) {
  const inRail = useXIntelStore((s) => s.targets.some((t) => t.toLowerCase() === member.username.toLowerCase()))
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[var(--color-border-faint)] transition-colors">
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt="" className="w-7 h-7 rounded-full shrink-0" draggable={false} />
      ) : (
        <div className="w-7 h-7 rounded-full bg-[var(--color-bg-raised)] shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate text-[12.5px] text-[var(--color-text-primary)]">{member.displayName}</span>
          {member.affiliation && <AffiliationBadge affiliation={member.affiliation} className="[&_img]:w-3 [&_img]:h-3" />}
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-[var(--color-text-tertiary)]">
          <span className="truncate">@{member.username}</span>
          <span className="shrink-0">{formatTokens(member.metrics.followers)} followers</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAdd(member)}
        disabled={inRail}
        className={cn(
          'shrink-0 rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors',
          inRail
            ? 'border-transparent text-[var(--color-text-quaternary)] cursor-default'
            : 'border-white/[0.12] text-white/60 hover:text-white/90 hover:border-white/25',
        )}
      >
        {inRail ? 'Added' : 'Add target'}
      </button>
    </div>
  )
}

/**
 * Affiliate roster browser. Opens from the target rail; lists an organization's
 * X affiliates (default: Venice), with manual Refresh, per-row add-as-target,
 * and — when X is connected — an org handle lookup for any other organization.
 */
export function AffiliatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  const connected = useXSelfStore((s) => s.connected)
  const rosters = useXAffiliatesStore((s) => s.rosters)
  const setActiveTopTab = useXIntelStore((s) => s.setActiveTopTab)
  const railTargets = useXIntelStore((s) => s.targets)

  const [org, setOrg] = useState<AffiliateOrg>(VENICE_ORG)
  const [lookup, setLookup] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster: AffiliateRoster | undefined = rosters[orgKey(org.username)]

  const run = async (target: AffiliateOrg) => {
    setBusy(true)
    setError(null)
    try {
      await refreshAffiliates(target)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load affiliates')
    } finally {
      setBusy(false)
    }
  }

  // Auto-load Venice on first open when we have no cached roster yet.
  useEffect(() => {
    if (!open) return
    if (orgKey(org.username) === orgKey(VENICE_ORG.username) && !roster && !busy) {
      void run(VENICE_ORG)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleLookup = async () => {
    const handle = lookup.trim().replace(/^@/, '')
    if (!handle) return
    if (!connected) {
      setError('Connect your X account to look up other organizations.')
      return
    }
    // The affiliates endpoint is keyed by org id; resolve the handle to an id
    // via a profile fetch first (OAuth path — arbitrary orgs need connection).
    setBusy(true)
    setError(null)
    try {
      const { gatherProfile } = await import('../../lib/x-intel/gather')
      const { data: profile } = await gatherProfile(handle, 'oauth')
      const nextOrg: AffiliateOrg = { id: profile.id, username: profile.username, name: profile.displayName }
      setOrg(nextOrg)
      setLookup('')
      await refreshAffiliates(nextOrg)
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not load @${handle}`)
    } finally {
      setBusy(false)
    }
  }

  const addAsTarget = (member: Profile) => {
    // Seed with the already-fetched profile for instant identity, then the
    // shared helper kicks off a fresh gather so posts/network populate.
    addTargetWithToast(member.username, member)
    setActiveTopTab('targets')
    onClose()
  }

  const members = roster?.members ?? []
  const orgLabel = org.name ?? `@${org.username}`

  // Roster members not yet on the rail — drives the "Add all" affordance.
  const onRail = new Set(railTargets.map((t) => t.toLowerCase()))
  const notAddedCount = members.filter((m) => !onRail.has(m.username.toLowerCase())).length

  const addAll = () => {
    const added = addTargetsWithToast(members)
    if (added > 0) {
      setActiveTopTab('targets')
      onClose()
    }
  }

  const backToVenice = useMemo(
    () => orgKey(org.username) !== orgKey(VENICE_ORG.username),
    [org.username],
  )

  return (
    <Modal open={open} onClose={onClose} aria-labelledby={titleId} className="max-w-md">
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-[15px] font-semibold text-[var(--color-text-primary)]">
          {orgLabel} affiliates
        </h2>
        <button
          type="button"
          onClick={() => run(org)}
          disabled={busy}
          className="rounded-md border border-white/[0.12] px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white/90 hover:border-white/25 transition-colors disabled:opacity-40"
        >
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--color-text-tertiary)]">
          {members.length > 0
            ? `${members.length} affiliated ${members.length === 1 ? 'account' : 'accounts'} · updated ${relativeTime(roster?.fetchedAt)}`
            : busy
              ? 'Loading affiliates…'
              : 'No affiliates loaded yet.'}
        </p>
        {members.length > 0 && (
          <button
            type="button"
            onClick={addAll}
            disabled={busy || notAddedCount === 0}
            title={notAddedCount === 0 ? 'All affiliates are already targets' : `Add all ${notAddedCount} to the rail`}
            className="shrink-0 rounded-md border border-white/[0.12] px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white/90 hover:border-white/25 transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            {notAddedCount === 0 ? 'All added' : `Add all${notAddedCount < members.length ? ` (${notAddedCount})` : ''}`}
          </button>
        )}
      </div>

      {backToVenice && (
        <button
          type="button"
          onClick={() => setOrg(VENICE_ORG)}
          className="mt-1 text-[11px] text-[var(--color-accent)]/80 hover:text-[var(--color-accent)] transition-colors"
        >
          ← Back to Venice
        </button>
      )}

      {error && <p className="mt-2 text-[11px] text-red-400/80">{error}</p>}

      <div className="mt-3 max-h-[45vh] overflow-y-auto -mx-1 pr-1">
        {members.length === 0 && !busy ? (
          <div className="px-2 py-6 text-center text-[11px] text-[var(--color-text-tertiary)]">
            Nothing to show. Hit Refresh to load the roster.
          </div>
        ) : (
          members.map((m) => <AffiliateRow key={m.id} member={m} onAdd={addAsTarget} />)
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--color-border-faint)]">
        {connected ? (
          <div className="flex items-center gap-2">
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleLookup() } }}
              placeholder="Look up another org, e.g. Stripe"
              className="flex-1 rounded-md border border-[var(--color-border-soft)] bg-[var(--color-bg-base)] px-2.5 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-border-strong)]"
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={busy || !lookup.trim()}
              className="shrink-0 rounded-md border border-white/[0.12] px-3 py-1.5 text-[11px] font-medium text-white/60 hover:text-white/90 hover:border-white/25 transition-colors disabled:opacity-40"
            >
              Look up
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            Connect your X account (header → Connect X) to look up any other organization's affiliates.
          </p>
        )}
      </div>
    </Modal>
  )
}
