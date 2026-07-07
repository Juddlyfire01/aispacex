import { useEffect, useRef } from 'react'
import { useXIntelStore, findReportKey } from '../../stores/x-intel-store'
import { TargetRail } from './target-rail'
import { ActivityFeed } from './activity-feed'
import { ProfileCard } from './profile-card'
import { ProfileReport } from './profile-report'
import { NetworkGraph } from './network-graph'
import { ComposeWorkspace } from '../compose/compose-workspace'
import { SelfProfileView } from './self-profile-view'
import { SelfRail } from './self-rail'
import { SelfFeed } from './self-feed'
import { SelfNetwork } from './self-network'
import { runGather } from '../../lib/x-intel/orchestrate'
import { refreshSelfSession } from '../../lib/x-intel/self-orchestrate'
import { isDemoTarget } from '../../lib/x-intel/fields'
import { syncComposeContextFromActiveTarget } from '../../lib/compose/open-compose'
import { SubTabs } from '../ui/sub-tabs'

// Top-level split: your own OAuth profile, target analysis, and the composer.
const TOP_TABS = [
  { id: 'me' as const, label: 'You' },
  { id: 'targets' as const, label: 'Others' },
  { id: 'post' as const, label: 'Post' },
]

// The self ("me") sub-tab bar mirrors the targets one: Profile/Feed/Network.
// The "Profile" label is singular (it's your own profile), unlike targets which
// pluralize to "Targets" when more than one is loaded.
const SELF_SUB_TABS = [
  { id: 'profile' as const, label: 'Profile' },
  { id: 'feed' as const, label: 'Feed' },
  { id: 'network' as const, label: 'Network' },
]

export function IntelView() {
  const activeSubTab = useXIntelStore((s) => s.activeSubTab)
  const setActiveSubTab = useXIntelStore((s) => s.setActiveSubTab)
  const activeSelfSubTab = useXIntelStore((s) => s.activeSelfSubTab)
  const setActiveSelfSubTab = useXIntelStore((s) => s.setActiveSelfSubTab)
  const activeTopTab = useXIntelStore((s) => s.activeTopTab)
  const setActiveTopTab = useXIntelStore((s) => s.setActiveTopTab)
  const activeTarget = useXIntelStore((s) => s.activeTarget)
  const prevTopTab = useRef(activeTopTab)

  // Entering Post from Profile/Targets: carry the active target into compose context.
  useEffect(() => {
    if (activeTopTab === 'post' && prevTopTab.current !== 'post') {
      syncComposeContextFromActiveTarget()
    }
    prevTopTab.current = activeTopTab
  }, [activeTopTab, activeTarget])

  const subTabs = [
    { id: 'profile' as const, label: 'Profile' },
    { id: 'feed' as const, label: 'Feed' },
    { id: 'network' as const, label: 'Network' },
  ]

  useEffect(() => {
    let cancelled = false
    // Auto-refresh watched targets; @AskVenice demo works without OAuth.
    void refreshSelfSession()
      .then((isConnected) => {
        if (cancelled) return
        const { targets, reports } = useXIntelStore.getState()
        for (const t of targets) {
          const key = findReportKey(reports, t) ?? t
          if (!reports[key]?.watch) continue
          if (!isConnected && !isDemoTarget(t)) continue
          runGather(key).catch(() => { /* surfaced on manual gather */ })
        }
      })
      .catch(() => { /* session probe failure = treated as disconnected */ })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col h-full min-h-0">
      <SubTabs tabs={TOP_TABS} value={activeTopTab} onChange={setActiveTopTab} className="px-4" />

      {activeTopTab === 'post' ? (
        <div className="flex-1 min-h-0">
          <ComposeWorkspace />
        </div>
      ) : activeTopTab === 'me' ? (
        // Profile ("me") tab: rail + Profile/Feed/Network sub-tab bar + content,
        // mirroring the Targets layout. SelfRail switches the active connected
        // account; the content swaps between the self profile split / feed / network.
        <div className="flex flex-1 min-h-0">
          <SelfRail />

          <div className="flex flex-col flex-1 min-w-0">
            <SubTabs tabs={SELF_SUB_TABS} value={activeSelfSubTab} onChange={setActiveSelfSubTab} className="px-4" size="sm" />
            <div className="flex-1 min-h-0">
              {activeSelfSubTab === 'profile' && <SelfProfileView />}
              {activeSelfSubTab === 'feed' && <SelfFeed />}
              {activeSelfSubTab === 'network' && <SelfNetwork />}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          <TargetRail />

          <div className="flex flex-col flex-1 min-w-0">
            <SubTabs tabs={subTabs} value={activeSubTab} onChange={setActiveSubTab} className="px-4" size="sm" />
            <div className="flex-1 min-h-0">
              {activeSubTab === 'profile' && (
                <div className="flex flex-col lg:flex-row h-full min-h-0">
                  <div className="lg:w-[340px] lg:shrink-0 lg:border-r border-white/[0.05] lg:h-full min-h-0 overflow-hidden">
                    <ProfileCard />
                  </div>
                  <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                    <ProfileReport />
                  </div>
                </div>
              )}
              {activeSubTab === 'network' && <NetworkGraph />}
              {activeSubTab === 'feed' && <ActivityFeed />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
