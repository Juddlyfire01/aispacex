import { useState } from 'react'
import { useXSelfStore } from '../../stores/x-self-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { refreshSelfPosts, refreshSelfNetwork } from '../../lib/x-intel/self-orchestrate'
import { runGather } from '../../lib/x-intel/orchestrate'
import { NetworkGraphInner } from './network-graph'

/** Network sub-tab for the self Profile tab. Wires the shared NetworkGraphInner
 *  to the active self account's edges. Clicking a node offers to add that
 *  account as an intel target (your network → candidate targets). */
export function SelfNetwork() {
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const account = useXSelfStore((s) => (s.activeAccountId ? s.accounts[s.activeAccountId] : undefined))
  const connected = useXSelfStore((s) => s.connected)
  const addTarget = useXIntelStore((s) => s.addTarget)
  const [refreshing, setRefreshing] = useState<null | 'posts' | 'mentions'>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const runRefresh = async (mode: 'posts' | 'mentions') => {
    setRefreshing(mode)
    setRefreshError(null)
    try {
      await (mode === 'mentions' ? refreshSelfNetwork() : refreshSelfPosts())
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(null)
    }
  }

  if (!activeAccountId || !account) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No account selected</div>
  }

  const lastGathered = account.refreshedAt.posts ?? account.posts[0]?.gatheredAt

  const onAddTarget = (username: string) => {
    addTarget(username)
    runGather(username).catch(() => { /* surfaced in target rail */ })
  }

  return (
    <NetworkGraphInner
      profile={account.profile}
      edges={account.edges}
      subjectLabel={`@${account.username}`}
      connected={connected}
      canGather={connected}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={runRefresh}
      onAddTarget={onAddTarget}
      canAddTargets
      lastGatheredIso={lastGathered}
    />
  )
}
