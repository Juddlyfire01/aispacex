import { useState, useEffect, lazy, Suspense, type ComponentType } from 'react'
import { useSettingsStore, type Tab } from './stores/settings-store'
import { useAuthStore } from './stores/auth-store'
import { Sidebar } from './components/layout/sidebar'
import { Header } from './components/layout/header'
import { ApiKeyDialog } from './components/layout/api-key-dialog'
import { ErrorBoundary } from './components/ui/error-boundary'
import { Toaster } from './components/ui/toaster'
import { ConfirmDialogHost } from './components/ui/confirm-dialog'
import { PromptDialogHost } from './components/ui/prompt-dialog'
import { useApplyAppearance } from './hooks/use-apply-appearance'
import { useXOAuthBootstrap } from './hooks/use-x-oauth-bootstrap'
import { primeXOAuthReturnShell } from './lib/x-intel/self-orchestrate'
import { isXOAuthReturnPending } from './lib/x-intel/self-client'
import { useXSelfStore } from './stores/x-self-store'

import { ViewLoadingFallback, VIEW_LOADING_LABEL } from './components/ui/spinner'
import { XConnectFlow } from './components/x-intel/x-connect-flow'
import { IntelLoadingShell } from './components/x-intel/intel-loading-shell'

// Before first React paint: pin Intel + connecting when returning from X OAuth
// so we never flash the previous tab or a generic Suspense spinner.
primeXOAuthReturnShell()

/** Named-export lazy view with a standard Suspense fallback. */
function lazyView(
  loader: () => Promise<{ default: ComponentType }>,
  label: string,
): ComponentType {
  const Lazy = lazy(loader)
  return function LazyViewShell() {
    return (
      <Suspense fallback={<ViewLoadingFallback label={label} />}>
        <Lazy />
      </Suspense>
    )
  }
}

// Live tabs match the sidebar (+ Settings). Shelved: chat/playground/workflows/embeddings.
const ImagePage = lazyView(
  () => import('./components/image/image-page').then((m) => ({ default: m.ImagePage })),
  VIEW_LOADING_LABEL.image,
)
const AudioView = lazyView(
  () => import('./components/audio/audio-view').then((m) => ({ default: m.AudioView })),
  VIEW_LOADING_LABEL.audio,
)
const MusicView = lazyView(
  () => import('./components/music/music-view').then((m) => ({ default: m.MusicView })),
  VIEW_LOADING_LABEL.music,
)
const VideoView = lazyView(
  () => import('./components/video/video-view').then((m) => ({ default: m.VideoView })),
  VIEW_LOADING_LABEL.video,
)
const StatsView = lazyView(
  () => import('./components/stats/stats-view').then((m) => ({ default: m.StatsView })),
  VIEW_LOADING_LABEL.stats,
)
const SignalView = lazyView(
  () => import('./components/signal/signal-view').then((m) => ({ default: m.SignalView })),
  VIEW_LOADING_LABEL.signal,
)
const NewsView = lazyView(
  () => import('./components/news/news-view').then((m) => ({ default: m.NewsView })),
  VIEW_LOADING_LABEL.news,
)
const SettingsView = lazyView(
  () => import('./components/settings/settings-view').then((m) => ({ default: m.SettingsView })),
  VIEW_LOADING_LABEL.settings,
)

const LazyIntelView = lazy(() => import('./components/x-intel/intel-view').then((m) => ({ default: m.IntelView })))
function IntelView() {
  // On OAuth return use the same Connecting shell as SelfProfileView — not "Loading intel…".
  const connecting = useXSelfStore((s) => s.connecting)
  const oauthReturn = connecting || isXOAuthReturnPending()
  const fallback = oauthReturn
    ? <XConnectFlow phase="authorizing" />
    : <IntelLoadingShell />
  return (
    <Suspense fallback={fallback}>
      <LazyIntelView />
    </Suspense>
  )
}

const views = {
  image: ImagePage,
  audio: AudioView,
  music: MusicView,
  video: VideoView,
  intel: IntelView,
  signal: SignalView,
  stats: StatsView,
  news: NewsView,
  settings: SettingsView,
} as const

type LiveTab = keyof typeof views

const TAB_ORDER: LiveTab[] = ['image', 'audio', 'music', 'video', 'intel']

export function App() {
  const needsUnlock = useAuthStore((s) => s.hasEncrypted && !s.apiKey)
  const [apiKeyOpen, setApiKeyOpen] = useState(needsUnlock)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const ActiveView = (activeTab in views ? views[activeTab as LiveTab] : views.intel)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta) return

      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= TAB_ORDER.length) {
        e.preventDefault()
        setActiveTab(TAB_ORDER[num - 1] as Tab)
        setMobileSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveTab])

  useApplyAppearance()
  useXOAuthBootstrap()

  return (
    <>
      <div className="ui-scale-shell flex h-[100dvh] w-full overflow-hidden">
      {/* Mobile drawer overlay */}
      {mobileSidebarOpen && (
        <button
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0">
        <Header
          onOpenApiKey={() => setApiKeyOpen(true)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
        <main className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <ErrorBoundary key={activeTab}>
            <div className="flex flex-col flex-1 min-h-0 h-full">
              <ActiveView />
            </div>
          </ErrorBoundary>
        </main>
      </div>
      </div>
      <ApiKeyDialog open={apiKeyOpen} onClose={() => setApiKeyOpen(false)} />
      <Toaster />
      <ConfirmDialogHost />
      <PromptDialogHost />
    </>
  )
}
