import { useEffect, useRef, useState, lazy, Suspense, type ReactNode } from 'react'
import { useXIntelStore, findReportKey } from '../../stores/x-intel-store'
import { TargetRail } from './target-rail'
import { ActivityFeed } from './activity-feed'
import { ProfileCard } from './profile-card'
import { ProfileReport } from './profile-report'
import { SelfProfileView } from './self-profile-view'
import { SelfRail } from './self-rail'
import { SelfFeed } from './self-feed'
import { runGather } from '../../lib/x-intel/orchestrate'
import { refreshSelfSession } from '../../lib/x-intel/self-orchestrate'
import { isDemoTarget } from '../../lib/x-intel/fields'
import { syncComposeContextFromActiveTarget } from '../../lib/compose/open-compose'
import { SubTabs } from '../ui/sub-tabs'
import { ViewLoadingFallback, VIEW_LOADING_LABEL } from '../ui/spinner'
import { cn } from '../../lib/utils'

// Compose + network panes are heavy and only used on their tabs — keep them out of
// the initial intel chunk until Post / Network is opened.
const LazyComposeWorkspace = lazy(() =>
  import('../compose/compose-workspace').then((m) => ({ default: m.ComposeWorkspace })),
)
const LazyNetworkGraph = lazy(() =>
  import('./network-graph').then((m) => ({ default: m.NetworkGraph })),
)
const LazySelfNetwork = lazy(() =>
  import('./self-network').then((m) => ({ default: m.SelfNetwork })),
)

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

/** Same split as GenerationView / ImageTools: fixed rail + scrollable main. */
function ProfileSplit({
  rail,
  main,
}: {
  rail: ReactNode
  main: ReactNode
}) {
  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0">
      <aside className="lg:w-[340px] lg:shrink-0 lg:border-r border-[var(--color-border-faint)] flex flex-col max-h-[55vh] lg:max-h-none min-h-0">
        {rail}
      </aside>
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {main}
      </div>
    </div>
  )
}

export function IntelView() {
  const activeSubTab = useXIntelStore((s) => s.activeSubTab)
  const setActiveSubTab = useXIntelStore((s) => s.setActiveSubTab)
  const activeSelfSubTab = useXIntelStore((s) => s.activeSelfSubTab)
  const setActiveSelfSubTab = useXIntelStore((s) => s.setActiveSelfSubTab)
  const activeTopTab = useXIntelStore((s) => s.activeTopTab)
  const setActiveTopTab = useXIntelStore((s) => s.setActiveTopTab)
  const activeTarget = useXIntelStore((s) => s.activeTarget)
  const prevTopTab = useRef(activeTopTab)

  // Keep Post warm once visited (ComposeWorkspace is expensive to remount).
  const [postMounted, setPostMounted] = useState(activeTopTab === 'post')

  useEffect(() => {
    if (activeTopTab === 'post') setPostMounted(true)
  }, [activeTopTab])

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

  // Shell matches ImagePage: tabs + flex-1 body. No overflow-hidden cascade —
  // App main already clips; panes scroll their own content (GenerationView style).
  return (
    <div className="flex flex-col h-full">
      <SubTabs tabs={TOP_TABS} value={activeTopTab} onChange={setActiveTopTab} className="px-4" />

      <div className="flex-1 min-h-0">
        {activeTopTab === 'me' && (
          <div className="flex h-full min-h-0">
            <SelfRail />
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              <SubTabs tabs={SELF_SUB_TABS} value={activeSelfSubTab} onChange={setActiveSelfSubTab} className="px-4" size="sm" />
              <div className="flex-1 min-h-0">
                {activeSelfSubTab === 'profile' && <SelfProfileView />}
                {activeSelfSubTab === 'feed' && <SelfFeed />}
                {activeSelfSubTab === 'network' && (
                  <Suspense fallback={<ViewLoadingFallback label={VIEW_LOADING_LABEL.intel} />}>
                    <LazySelfNetwork />
                  </Suspense>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTopTab === 'targets' && (
          <div className="flex h-full min-h-0">
            <TargetRail />
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              <SubTabs tabs={subTabs} value={activeSubTab} onChange={setActiveSubTab} className="px-4" size="sm" />
              <div className="flex-1 min-h-0">
                {activeSubTab === 'profile' && (
                  <ProfileSplit rail={<ProfileCard />} main={<ProfileReport />} />
                )}
                {activeSubTab === 'network' && (
                  <Suspense fallback={<ViewLoadingFallback label={VIEW_LOADING_LABEL.intel} />}>
                    <LazyNetworkGraph />
                  </Suspense>
                )}
                {activeSubTab === 'feed' && <ActivityFeed />}
              </div>
            </div>
          </div>
        )}

        {postMounted && (
          <div
            className={cn('h-full min-h-0', activeTopTab !== 'post' && 'hidden')}
            aria-hidden={activeTopTab !== 'post'}
          >
            <Suspense fallback={<ViewLoadingFallback label={VIEW_LOADING_LABEL.compose} />}>
              <LazyComposeWorkspace />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  )
}
