import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useAuthStore } from '../../stores/auth-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { Select } from '../ui/select'
import { ConnectionPill } from '../ui/shared'

const modelTypeMap: Record<string, string> = {
  image: 'image',
  audio: 'tts',
  music: 'music',
  video: 'video',
}

const tabLabels: Record<string, string> = {
  image: 'Image',
  audio: 'Audio',
  music: 'Music',
  video: 'Video',
  intel: 'Intel',
  signal: 'Signal',
  stats: 'Stats',
  news: 'News',
  settings: 'Settings',
}

const tabSubtitles: Record<string, string> = {
  image: 'Generate images from text',
  audio: 'Text-to-speech and transcription',
  music: 'Generate music and sound',
  video: 'Generate video clips',
  intel: 'X intelligence gathering',
  signal: 'Venice community & attention across X',
  stats: 'Real-time on-chain data for VVV & DIEM on Base',
  news: 'Breaking headlines across your sources',
  settings: 'Preferences and appearance',
}

const noModelSelector = new Set(['video', 'music', 'audio', 'image', 'intel', 'signal', 'stats', 'news', 'settings'])

interface Props {
  onOpenConnections: () => void
  onOpenMobileSidebar?: () => void
}

export function Header({ onOpenConnections, onOpenMobileSidebar }: Props) {
  const { activeTab, selectedModels, setSelectedModel } = useSettingsStore()
  const apiKey = useAuthStore((s) => s.apiKey)
  const xConnecting = useXSelfStore((s) => s.connecting)
  const hasOwnSelector = noModelSelector.has(activeTab)
  const modelType = modelTypeMap[activeTab] || 'text'
  const { data: models, defaultModelId } = useModels(hasOwnSelector ? undefined : modelType)
  const currentModel = hasOwnSelector ? '' : (selectedModels[activeTab] || defaultModelId)
  const modelOptions = hasOwnSelector ? [] : (models?.map((m) => ({ value: m.id, label: m.model_spec?.name || m.id })) ?? [])

  const veniceReady = Boolean(apiKey)

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

      <ConnectionPill
        connected={veniceReady}
        connecting={xConnecting}
        connectedLabel="Connections"
        disconnectedLabel="Connections"
        connectingLabel="Connecting X…"
        onClick={onOpenConnections}
      />
    </header>
  )
}
