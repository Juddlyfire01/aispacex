import { promptDialog } from '../../stores/prompt-store'

interface ArticleFormatToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>
  onEdited: () => void
}

const btn =
  'px-1.5 py-0.5 text-[11px] rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-faint)] transition-colors'

function run(cmd: string, value?: string) {
  // Article formatting mirrors X DraftJS capabilities only.
  document.execCommand(cmd, false, value)
}

export function ArticleFormatToolbar({ editorRef, onEdited }: ArticleFormatToolbarProps) {
  const focusAnd = (fn: () => void) => {
    editorRef.current?.focus()
    fn()
    onEdited()
  }

  const block = (tag: string) => focusAnd(() => run('formatBlock', `<${tag}>`))

  const link = async () => {
    const url = await promptDialog({
      title: 'Link URL',
      placeholder: 'https://',
      confirmLabel: 'OK',
    })
    if (!url?.trim()) return
    focusAnd(() => run('createLink', url.trim()))
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-0.5">
        <button type="button" className={`${btn} font-bold`} title="Bold" onClick={() => focusAnd(() => run('bold'))}>
          B
        </button>
        <button type="button" className={`${btn} italic`} title="Italic" onClick={() => focusAnd(() => run('italic'))}>
          I
        </button>
        <button
          type="button"
          className={`${btn} line-through`}
          title="Strikethrough"
          onClick={() => focusAnd(() => run('strikeThrough'))}
        >
          S
        </button>
        <span className="w-px h-3 bg-[var(--color-border-faint)] mx-0.5" />
        <button type="button" className={btn} title="Heading 1" onClick={() => block('h1')}>
          H1
        </button>
        <button type="button" className={btn} title="Heading 2" onClick={() => block('h2')}>
          H2
        </button>
        <button type="button" className={btn} title="Heading 3" onClick={() => block('h3')}>
          H3
        </button>
        <button type="button" className={btn} title="Paragraph" onClick={() => block('p')}>
          ¶
        </button>
        <span className="w-px h-3 bg-[var(--color-border-faint)] mx-0.5" />
        <button type="button" className={btn} title="Bullet list" onClick={() => focusAnd(() => run('insertUnorderedList'))}>
          •
        </button>
        <button type="button" className={btn} title="Numbered list" onClick={() => focusAnd(() => run('insertOrderedList'))}>
          1.
        </button>
        <button type="button" className={btn} title="Quote" onClick={() => block('blockquote')}>
          “
        </button>
        <button type="button" className={btn} title="Link" onClick={link}>
          Link
        </button>
      </div>
      <p className="text-[10px] text-[var(--color-text-quaternary)] leading-relaxed">
        X Article formats only — headings, lists, quotes, bold/italic/strike, links. No markdown syntax.
      </p>
    </div>
  )
}
