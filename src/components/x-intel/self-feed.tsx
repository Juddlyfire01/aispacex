import { useState } from 'react'
import { useXSelfStore } from '../../stores/x-self-store'
import { refreshSelfPosts } from '../../lib/x-intel/self-orchestrate'
import { ActivityFeedInner } from './activity-feed'

/** Feed sub-tab for the self Profile tab. Wires the shared ActivityFeedInner
 *  to the active self account's posts. Self accounts don't have a "watch"
 *  toggle (that's a target concept), so it's pinned off. */
export function SelfFeed() {
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const account = useXSelfStore((s) => (s.activeAccountId ? s.accounts[s.activeAccountId] : undefined))
  const connected = useXSelfStore((s) => s.connected)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  if (!activeAccountId || !account) {
    return <div className="flex items-center justify-center h-full text-[12px] text-white/15">No account selected</div>
  }

  const runRefresh = async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await refreshSelfPosts({ maxResults: 50 })
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const lastGathered = account.refreshedAt.posts ?? account.posts[0]?.gatheredAt

  return (
    <ActivityFeedInner
      posts={account.posts}
      watch={false}
      onToggleWatch={() => { /* self feed has no watch concept */ }}
      refreshing={refreshing}
      refreshError={refreshError}
      onRefresh={runRefresh}
      lastGatheredIso={lastGathered}
      canRefresh={connected}
      emptyTitle="No posts gathered yet"
      emptyHint={connected
        ? `Fetch @${account.username}'s recent posts (up to 50 per pull).`
        : 'Connect your X account first (header → Connect X).'}
      emptyActionLabel="Gather posts"
    />
  )
}
