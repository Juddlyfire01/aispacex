import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useAuthStore } from '../../stores/auth-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { beginSelfLogin } from '../../lib/x-intel/self-client'
import { VENICE_SERVER_FRONTED } from '../../lib/venice-config'
import { Select } from '../ui/select'
import { ConnectionPill } from '../ui/shared'

const modelTypeMap: Record<string, string> = {
  chat: 'text',
  image: 'image',
  audio: 'tts',
  music: 'music',
  video: 'video',
  embeddings: 'embedding',
}

const tabLabels: Record<string, string> = {
  chat: 'Chat',
  image: 'Image',
  audio: 'Audio',
  music: 'Music',
  video: 'Video',
  embeddings: 'Embeddings',
  workflows: 'Workflows',
  playground: 'Playground',
  intel: 'Intel',
  signal: 'Signal',
  stats: 'Stats',
  news: 'News',
  settings: 'Settings',
}

const tabSubtitles: Record<string, string> = {
  chat: 'Conversational AI',
  image: 'Generate images from text',
  audio: 'Text-to-speech and transcription',
  music: 'Generate music and sound',
  video: 'Generate video clips',
  embeddings: 'Vector representations of text',
  workflows: 'Chain models visually',
  playground: 'Build workflows by chatting',
  intel: 'X intelligence gathering',
  signal: 'Venice community & attention across X',
  stats: 'Real-time on-chain data for VVV & DIEM on Base',
  news: 'Breaking headlines across your sources',
  settings: 'Preferences and appearance',
}

const noModelSelector = new Set(['video', 'workflows', 'playground', 'intel', 'signal', 'stats', 'news', 'settings'])

interface Props {
  onOpenApiKey: () => void
  onOpenMobileSidebar?: () => void
}

export function Header({ onOpenApiKey, onOpenMobileSidebar }: Props) {
  const { activeTab, selectedModels, setSelectedModel } = useSettingsStore()
  const apiKey = useAuthStore((s) => s.apiKey)
  const xConnected = useXSelfStore((s) => s.connected)
  const xConnecting = useXSelfStore((s) => s.connecting)
  const hasOwnSelector = noModelSelector.has(activeTab)
  const modelType = modelTypeMap[activeTab] || 'text'
  const { data: models, defaultModelId } = useModels(hasOwnSelector ? undefined : modelType)
  const currentModel = hasOwnSelector ? '' : (selectedModels[activeTab] || defaultModelId)
  const modelOptions = hasOwnSelector ? [] : (models?.map((m) => ({ value: m.id, label: m.model_spec?.name || m.id })) ?? [])

  return (
    <header className="flex items-center gap-3 h-14 px-3 border-b border-[var(--color-border-faint)] bg-[var(--color-bg-base)] shrink-0">
      <button
        onClick={() => onOpenMobileSidebar?.()}
        aria-label="Open menu"
        className="md:hidden text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors p-1.5 -ml-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      <div className="flex flex-col min-w-0">
        <span className="text-[14px] font-semibold text-[var(--color-text-primary)] leading-none">{tabLabels[activeTab]}</span>
        <span className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 leading-none truncate hidden sm:block">{tabSubtitles[activeTab]}</span>
      </div>

      {!hasOwnSelector && (
        <>
          <div className="w-px h-5 bg-[var(--color-border-soft)] hidden sm:block" aria-hidden />
          <Select
            value={currentModel}
            onChange={(v) => setSelectedModel(activeTab, v)}
            options={modelOptions}
            searchable
            placeholder="Select model…"
            className="w-44 sm:w-64"
          />
        </>
      )}

      <div className="flex-1" />

      {activeTab === 'intel' && (
        <ConnectionPill
          connected={xConnected}
          connecting={xConnecting}
          connectedLabel="X: Connected"
          disconnectedLabel="Connect X"
          connectingLabel="Connecting…"
          onClick={() => { if (!xConnected && !xConnecting) beginSelfLogin() }}
        />
      )}

      {/* Venice key pill is only meaningful in bring-your-own-key mode. When the
          app fronts a shared server-side key, there's nothing to connect, so we
          hide it — leaving at most the single X indicator on the Intel tab. */}
      {!VENICE_SERVER_FRONTED && (
        <ConnectionPill
          connected={!!apiKey}
          connectedLabel="Connected"
          disconnectedLabel="Connect API key"
          onClick={onOpenApiKey}
        />
      )}
    </header>
  )
}
