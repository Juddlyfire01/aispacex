import { useEffect, useRef, useState } from 'react'
import { prefetchEmojiCatalog } from '../../lib/compose/emoji-catalog'
import {
  applyXTextStyle,
  replaceSelection,
  toPlainAscii,
  wrapSelection,
  type XTextStyle,
} from '../../lib/compose/x-text-format'
import { EmojiPicker } from './emoji-picker'

interface FormatToolbarProps {
  value: string
  onChange: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

function applyEdit(
  textarea: HTMLTextAreaElement | null,
  edit: ReturnType<typeof replaceSelection>,
  onChange: (value: string) => void,
) {
  onChange(edit.value)
  requestAnimationFrame(() => {
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd)
  })
}

export function FormatToolbar({ value, onChange, textareaRef }: FormatToolbarProps) {
  const [showGuide, setShowGuide] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const emojiRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    prefetchEmojiCatalog()
  }, [])

  const withSelection = (fn: (text: string, start: number, end: number) => ReturnType<typeof replaceSelection>) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    applyEdit(el, fn(value, start, end), onChange)
  }

  const styleSelection = (style: XTextStyle) => {
    withSelection((text, start, end) => {
      const selected = text.slice(start, end)
      const insert = selected ? applyXTextStyle(selected, style) : ''
      return replaceSelection(text, start, end, insert)
    })
  }

  const insertToken = (prefix: string) => {
    withSelection((text, start, end) => wrapSelection(text, start, end, prefix))
  }

  const insertEmoji = (emoji: string) => {
    withSelection((text, start, end) => replaceSelection(text, start, end, emoji))
    setShowEmoji(false)
  }

  const plainSelection = () => {
    withSelection((text, start, end) => {
      const selected = text.slice(start, end)
      return replaceSelection(text, start, end, selected ? toPlainAscii(selected) : '')
    })
  }

  const insertNewline = () => {
    withSelection((text, start, end) => replaceSelection(text, start, end, '\n'))
  }

  const btn =
    'px-1.5 py-0.5 text-[11px] rounded text-white/45 hover:text-white/80 hover:bg-white/[0.06] transition-colors disabled:opacity-25'

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-0.5">
        <button type="button" className={`${btn} font-bold`} title="Bold (Unicode)" onClick={() => styleSelection('bold')}>
          B
        </button>
        <button type="button" className={`${btn} italic`} title="Italic (Unicode)" onClick={() => styleSelection('italic')}>
          I
        </button>
        <button type="button" className={btn} title="Plain ASCII" onClick={plainSelection}>
          Aa
        </button>
        <span className="w-px h-3 bg-white/10 mx-0.5" />
        <button type="button" className={btn} title="Mention" onClick={() => insertToken('@')}>
          @
        </button>
        <button type="button" className={btn} title="Hashtag" onClick={() => insertToken('#')}>
          #
        </button>
        <button type="button" className={btn} title="Cashtag" onClick={() => insertToken('$')}>
          $
        </button>
        <span className="w-px h-3 bg-white/10 mx-0.5" />
        <button type="button" className={btn} title="Line break" onClick={insertNewline}>
          ↵
        </button>
        <div className="relative shrink-0" ref={emojiRef} data-emoji-picker>
          <button
            type="button"
            className={btn}
            title="Emoji"
            onClick={() => {
              setShowEmoji((v) => !v)
              setShowGuide(false)
            }}
          >
            😀
          </button>
          <EmojiPicker
            open={showEmoji}
            anchorRef={emojiRef}
            onClose={() => setShowEmoji(false)}
            onPick={(emoji) => {
              insertEmoji(emoji)
              setShowEmoji(false)
            }}
          />
        </div>
        <div className="flex-1" />
        <button
          type="button"
          className="text-[10px] text-white/25 hover:text-white/50 transition-colors"
          onClick={() => {
            setShowGuide((v) => !v)
            setShowEmoji(false)
          }}
        >
          {showGuide ? 'Hide formats' : 'X formats'}
        </button>
      </div>

      {showGuide && (
        <p className="text-[10px] text-white/30 leading-relaxed">
          Standard posts are plain UTF-8 — no Markdown. Bold/italic use Unicode styled letters. @ # $ and URLs become
          entities. Emojis and most non-Latin chars count double toward 280.
        </p>
      )}
    </div>
  )
}
