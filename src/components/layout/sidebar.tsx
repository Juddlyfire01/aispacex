import { cn } from '../../lib/utils'
import { useSettingsStore, type Tab } from '../../stores/settings-store'
import { AppBrand, AppWordmark } from '../ui/logo'
import { PanelToggleButton } from './panel-toggle'
import { RAIL_FOOTER_CLASS, RAIL_FOOTER_ROW_CLASS } from './rail-footer'

function ImageIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>)
}
function AudioIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></svg>)
}
function VideoIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>)
}
function MusicIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="15.5" r="2.5" /><path d="M8 17.5V5l12-2v12.5" /></svg>)
}
function IntelIcon() {
  return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><circle cx="11" cy="11" r="2.5" /></svg>)
}
function SignalIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 12 6 12 9 5 15 19 18 12 22 12" /></svg>)
}
function StatsIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>)
}
function NewsIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 002-2V4a1 1 0 00-1-1H5a1 1 0 00-1 1v16a2 2 0 01-2-2V8" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="13" y2="15" /></svg>)
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

interface NavGroup {
  label: string
  items: Array<{ id: Tab; label: string; Icon: () => React.JSX.Element }>
}

const navGroups: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [
      { id: 'intel', label: 'Intel', Icon: IntelIcon },
      { id: 'signal', label: 'Signal', Icon: SignalIcon },
      { id: 'stats', label: 'Stats', Icon: StatsIcon },
      { id: 'news', label: 'News', Icon: NewsIcon },
    ],
  },
  {
    label: 'Generate',
    items: [
      { id: 'image', label: 'Image', Icon: ImageIcon },
      { id: 'audio', label: 'Audio', Icon: AudioIcon },
      { id: 'music', label: 'Music', Icon: MusicIcon },
      { id: 'video', label: 'Video', Icon: VideoIcon },
    ],
  },
]

interface Props {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: Props) {
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen)
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar)

  const expanded = sidebarOpen || mobileOpen

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        'flex flex-col h-full bg-[var(--color-bg-base)] border-r border-[var(--color-border-faint)] transition-all duration-200 ease-out',
        'fixed top-0 left-0 z-40 w-64 h-[100dvh] md:static md:h-full md:shrink-0 overflow-x-hidden',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        sidebarOpen ? 'md:w-52' : 'md:w-[60px]',
      )}
    >
      <div className={cn(
        'flex items-center h-14 shrink-0 border-b border-[var(--color-border-faint)]',
        expanded ? 'px-2 gap-1' : 'md:px-1.5 md:justify-center px-2',
      )}>
        {expanded ? (
          <>
            <AppBrand className="min-w-0 flex-1" />
            <PanelToggleButton
              expanded={sidebarOpen}
              onClick={toggleSidebar}
              label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              className="hidden md:flex shrink-0"
            />
            <button
              onClick={onMobileClose}
              aria-label="Close menu"
              className="md:hidden shrink-0 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </>
        ) : (
          <>
            <PanelToggleButton
              expanded={false}
              onClick={toggleSidebar}
              label="Expand sidebar"
              className="hidden md:flex mx-auto shrink-0"
            />
            <AppWordmark className="text-[15px] shrink-0 md:hidden" />
            <button
              onClick={onMobileClose}
              aria-label="Close menu"
              className="md:hidden ml-auto shrink-0 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <nav aria-label="Sections" className="flex flex-col gap-3 py-3 overflow-y-auto shrink-0">
          {navGroups.map((group) => (
            <div key={group.label} className={cn(expanded ? 'px-1.5' : 'md:px-1.5 px-1.5')}>
              {expanded && (
                <div className="px-2 pb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-text-tertiary)] font-semibold">
                  {group.label}
                </div>
              )}
              <div className="flex flex-col gap-px">
                {group.items.map(({ id, label, Icon }) => {
                  const isActive = activeTab === id
                  return (
                    <button
                      key={id}
                      onClick={() => { setActiveTab(id); onMobileClose?.() }}
                      aria-current={isActive ? 'page' : undefined}
                      title={!expanded ? label : undefined}
                      className={cn(
                        'relative flex items-center gap-2.5 rounded-lg text-[14px] transition-all duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
                        expanded ? 'px-2.5 py-2' : 'md:px-0 md:py-2 md:justify-center px-2.5 py-2',
                        isActive
                          ? 'text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)]',
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-[var(--color-accent)]" />
                      )}
                      <Icon />
                      {expanded && <span className="font-medium">{label}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className={RAIL_FOOTER_CLASS}>
        <button
          type="button"
          onClick={() => {
            const store = useSettingsStore.getState()
            if (store.activeTab === 'settings') {
              store.closeSettings()
            } else {
              store.openSettings()
              onMobileClose?.()
            }
          }}
          aria-label={activeTab === 'settings' ? 'Close settings' : 'Open settings'}
          aria-pressed={activeTab === 'settings'}
          title="Settings"
          className={cn(
            RAIL_FOOTER_ROW_CLASS,
            'relative flex-row items-center rounded-lg text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
            expanded ? 'gap-2.5 w-full' : 'md:justify-center w-full',
            activeTab === 'settings'
              ? 'text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)]',
          )}
        >
          {activeTab === 'settings' && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-[var(--color-accent)]" />
          )}
          <SettingsIcon />
          {expanded && <span className="font-medium">Settings</span>}
        </button>
      </div>
    </aside>
  )
}
