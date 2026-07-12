import { useMemo, useState } from 'react'
import { useXSelfStore } from '../../stores/x-self-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { refreshSelfNetwork } from '../../lib/x-intel/self-orchestrate'
import { withRefreshToast } from '../../lib/x-intel/refresh-toast'
import { addTargetWithToast } from '../../lib/x-intel/add-target'
import { NetworkGraphInner, collectSiblings } from './network-graph'

/** Network sub-tab for the self Profile tab. Wires the shared NetworkGraphInner
 *  to the active self account's edges. Clicking a node offers to add that
 *  account as an intel target (your network → candidate targets). */
export function SelfNetwork() {
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const account = useXSelfStore((s) => (s.activeAccountId ? s.accounts[s.activeAccountId] : undefined))
  const connected = useXSelfStore((s) => s.connected)
  const jumpToSelfFeedPost = useXIntelStore((s) => s.jumpToSelfFeedPost)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const profileId = account?.profile?.id ?? null
  const siblings = useMemo(() => collectSiblings(profileId), [profileId])

  const runRefresh = async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await withRefreshToast(
        `@${account?.username ?? 'you'}`,
        () => refreshSelfNetwork(),
      )
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  if (!activeAccountId || !account) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No account selected</div>
  }

  const lastGathered = account.refreshedAt.posts ?? account.posts[0]?.gatheredAt

  const onAddTarget = (username: string) => {
    addTargetWithToast(username)
  }

  return (
    <NetworkGraphInner
      profile={account.profile}
      edges={account.edges}
      posts={account.posts}
      siblings={siblings}
      subjectLabel={`@${account.username}`}
      connected={connected}
      canGather={connected}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={runRefresh}
      onAddTarget={onAddTarget}
      onJumpToPost={jumpToSelfFeedPost}
      canAddTargets
      lastGatheredIso={lastGathered}
    />
  )
}
