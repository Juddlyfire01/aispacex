import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { LoadingState } from '../ui/spinner'
import {
  getCachedEmojiCatalog,
  loadEmojiCatalog,
  searchEmojis,
  type EmojiCatalog,
  type EmojiCategory,
  type EmojiEntry,
} from '../../lib/compose/emoji-catalog'
import { computeFloatingRect, EMOJI_PICKER_HEIGHT_ESTIMATE, EMOJI_PICKER_WIDTH } from '../../lib/floating-panel'
import { twemojiUrl } from '../../lib/compose/twemoji'
import {
  loadRecentEmojis,
  pushRecentEmoji,
  recentAsEntries,
  type RecentEmoji,
} from '../../lib/compose/recent-emojis'

interface EmojiPickerProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  onPick: (emoji: string) => void
}

export function EmojiPicker({ open, anchorRef, onClose, onPick }: EmojiPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [catalog, setCatalog] = useState<EmojiCatalog | null>(() => getCachedEmojiCatalog())
  const [categoryId, setCategoryId] = useState('people')
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [recent, setRecent] = useState<RecentEmoji[]>([])

  const catalogLoading = open && !catalog

  useEffect(() => {
    if (!open) return
    setRecent(loadRecentEmojis())
    if (catalog) return
    let cancelled = false
    void loadEmojiCatalog().then((data) => {
      if (!cancelled) setCatalog(data)
    })
    return () => {
      cancelled = true
    }
  }, [open, catalog])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setCategoryId('people')
    }
  }, [open])

  const reposition = () => {
    const anchor = anchorRef.current
    if (!anchor) return
    const panel = panelRef.current
    const width = panel?.offsetWidth ?? EMOJI_PICKER_WIDTH
    const height = panel?.offsetHeight ?? EMOJI_PICKER_HEIGHT_ESTIMATE
    setPosition(computeFloatingRect(anchor.getBoundingClientRect(), width, height))
  }

  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, catalog, query, categoryId, catalogLoading, recent.length])

  const handlePick = (entry: Pick<EmojiEntry, 'native' | 'unified' | 'name'>) => {
    setRecent(pushRecentEmoji(entry))
    onPick(entry.native)
  }

  const recentEntries = useMemo(() => recentAsEntries(recent), [recent])
  const showRecent = !query.trim() && recentEntries.length > 0

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-emoji-picker]')) onClose()
    }
    const onViewportChange = () => reposition()

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, onClose, anchorRef])

  const activeCategory = useMemo(
    () => catalog?.categories.find((c) => c.id === categoryId) ?? catalog?.categories[0],
    [catalog, categoryId],
  )

  const visibleEntries = useMemo(() => {
    if (!catalog) return []
    const base = query.trim() ? catalog.allEntries : (activeCategory?.entries ?? [])
    return searchEmojis(base, query)
  }, [catalog, activeCategory, query])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      data-emoji-picker
      style={{ top: position.top, left: position.left, width: EMOJI_PICKER_WIDTH }}
      className="fixed z-[200] max-h-[min(20rem,calc(100vh-1rem))] flex flex-col rounded-lg border border-[var(--color-border-faint)] bg-[var(--color-bg-input)] shadow-2xl overflow-hidden"
    >
      <div className="p-2 border-b border-white/[0.06] shrink-0">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          disabled={catalogLoading}
          className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1 text-[11px] text-white/80 outline-none focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-placeholder)] disabled:opacity-40"
          autoFocus
        />
      </div>

      <div className="flex flex-1 min-h-0">
        {!query.trim() && catalog && (
          <div className="flex flex-col gap-0.5 p-1 border-r border-white/[0.06] bg-black/10 overflow-y-auto shrink-0">
            {catalog.categories.map((cat) => (
              <CategoryTab
                key={cat.id}
                category={cat}
                active={cat.id === (activeCategory?.id ?? categoryId)}
                onSelect={() => setCategoryId(cat.id)}
              />
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
          {showRecent && (
            <div className="mb-2 pb-2 border-b border-white/[0.06]">
              <p className="px-1 pb-1 text-[10px] font-medium text-white/30 uppercase tracking-wide">Recent</p>
              <div className="grid grid-cols-8 gap-0.5">
                {recentEntries.map((entry) => (
                  <EmojiCell key={entry.key} entry={entry} onPick={handlePick} />
                ))}
              </div>
            </div>
          )}

          {catalogLoading ? (
            <LoadingState
              className="min-h-[12rem]"
              label="Loading emojis…"
              size="md"
              labelClassName="text-[11px] text-white/30"
            />
          ) : (
            <>
              {!query.trim() && visibleEntries.length === 0 && (
                <p className="text-[11px] text-white/30 px-1 py-2">No matches</p>
              )}
              {!query.trim() && visibleEntries.length > 0 && (
                <p className="px-1 pb-1 text-[10px] font-medium text-white/30 uppercase tracking-wide">
                  {activeCategory?.label ?? 'Emoji'}
                </p>
              )}
              <div className="grid grid-cols-8 gap-0.5">
                {visibleEntries.map((entry) => (
                  <EmojiCell key={entry.key} entry={entry} onPick={handlePick} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {catalog && !catalogLoading && (
        <div className="px-2 py-1 border-t border-white/[0.06] text-[9px] text-white/20 font-mono shrink-0">
          {query.trim()
            ? `${visibleEntries.length} results`
            : `${activeCategory?.entries.length ?? 0} in ${activeCategory?.label ?? ''} · ${catalog.allEntries.length} total`}
        </div>
      )}
    </div>,
    document.body,
  )
}

function EmojiCell({
  entry,
  onPick,
}: {
  entry: Pick<EmojiEntry, 'key' | 'native' | 'unified' | 'name'>
  onPick: (entry: Pick<EmojiEntry, 'native' | 'unified' | 'name'>) => void
}) {
  return (
    <button
      type="button"
      title={entry.name}
      className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 transition-colors"
      onClick={() => onPick(entry)}
    >
      <img
        src={twemojiUrl(entry.unified)}
        alt={entry.name}
        draggable={false}
        className="w-5 h-5"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          e.currentTarget.nextElementSibling?.classList.remove('hidden')
        }}
      />
      <span className="hidden text-[18px] leading-none font-emoji">{entry.native}</span>
    </button>
  )
}

function CategoryTab({
  category,
  active,
  onSelect,
}: {
  category: EmojiCategory
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      title={category.label}
      onClick={onSelect}
      className={`w-8 h-8 flex items-center justify-center rounded text-base font-emoji transition-colors ${
        active ? 'bg-white/15' : 'hover:bg-white/10'
      }`}
    >
      {category.icon}
    </button>
  )
}
