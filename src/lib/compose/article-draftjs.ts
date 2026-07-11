export interface DraftJsContentState {
  blocks: Array<{
    text: string
    type:
      | 'unstyled'
      | 'header-one'
      | 'header-two'
      | 'header-three'
      | 'unordered-list-item'
      | 'ordered-list-item'
      | 'blockquote'
      | 'atomic'
    entity_ranges?: Array<{ key: number; offset: number; length: number }>
    inline_style_ranges?: Array<{
      offset: number
      length: number
      style: 'bold' | 'italic' | 'strikethrough'
    }>
  }>
  entities: Array<{
    key: string
    value: {
      type: 'link' | 'image' | 'post'
      mutability: 'immutable' | 'mutable' | 'segmented'
      data: Record<string, unknown>
    }
  }>
}

export type DraftJsBlock = DraftJsContentState['blocks'][number]
export type DraftJsEntity = DraftJsContentState['entities'][number]

type ImageMap = Record<string, { mediaId: string; mediaKey?: string }>

const IMAGE_ONLY_RE = /^!\[([^\]]*)\]\(media:([^)]+)\)$/
const HEADER_RE = /^(#{1,3})\s+(.*)$/
const UL_RE = /^[-*]\s+(.*)$/
const OL_RE = /^\d+\.\s+(.*)$/
const BLOCKQUOTE_RE = /^>\s?(.*)$/
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g
const IMAGE_INLINE_RE = /!\[([^\]]*)\]\(media:([^)]+)\)/g

/** Strip common unsupported markdown markers; keep readable text. Does not trim. */
function stripUnsupportedMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/___(.+?)___/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

function parseInlineLinks(
  text: string,
  nextEntityKey: () => number,
  entities: DraftJsEntity[],
): { text: string; entity_ranges: NonNullable<DraftJsBlock['entity_ranges']> } {
  const entity_ranges: NonNullable<DraftJsBlock['entity_ranges']> = []
  let out = ''
  let last = 0
  const re = new RegExp(LINK_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out += stripUnsupportedMarkdown(text.slice(last, m.index))
    const label = stripUnsupportedMarkdown(m[1])
    const url = m[2]
    const offset = out.length
    out += label
    const key = nextEntityKey()
    entities.push({
      key: String(key),
      value: {
        type: 'link',
        mutability: 'mutable',
        data: { url },
      },
    })
    entity_ranges.push({ key, offset, length: label.length })
    last = m.index + m[0].length
  }
  out += stripUnsupportedMarkdown(text.slice(last))
  return { text: out, entity_ranges }
}

function pushTextBlock(
  blocks: DraftJsBlock[],
  entities: DraftJsEntity[],
  nextEntityKey: () => number,
  raw: string,
  type: DraftJsBlock['type'],
): void {
  const withoutImages = raw.replace(IMAGE_INLINE_RE, '').trim()
  if (!withoutImages) return

  const { text, entity_ranges } = parseInlineLinks(withoutImages, nextEntityKey, entities)
  if (!text) return

  const block: DraftJsBlock = { text, type }
  if (entity_ranges.length > 0) block.entity_ranges = entity_ranges
  blocks.push(block)
}

function pushImageBlock(
  blocks: DraftJsBlock[],
  entities: DraftJsEntity[],
  nextEntityKey: () => number,
  alt: string,
  localId: string,
  images: ImageMap | undefined,
): void {
  const mapped = images?.[localId]
  if (!mapped) {
    const fallback = stripUnsupportedMarkdown(alt).trim()
    if (fallback) blocks.push({ text: fallback, type: 'unstyled' })
    return
  }

  const key = nextEntityKey()
  const mediaId = mapped.mediaId
  const mediaKey = mapped.mediaKey
  const data: Record<string, unknown> = {
    media_items: [{ media_id: mediaId, ...(mediaKey ? { media_key: mediaKey } : {}) }],
    ...(alt ? { caption: alt } : {}),
  }

  entities.push({
    key: String(key),
    value: {
      type: 'image',
      mutability: 'immutable',
      data,
    },
  })

  blocks.push({
    text: ' ',
    type: 'atomic',
    entity_ranges: [{ key, offset: 0, length: 1 }],
  })
}

/**
 * Convert article markdown to X Articles DraftJS `content_state`.
 * v1: paragraphs, headers, lists, links, media:LOCAL_ID images. Unsupported syntax is stripped.
 * Soft-wrapped lines (single newlines) join into one paragraph; blank lines split paragraphs.
 */
export function markdownToContentState(
  md: string,
  opts?: { images?: Record<string, { mediaId: string; mediaKey?: string }> },
): DraftJsContentState {
  const blocks: DraftJsBlock[] = []
  const entities: DraftJsEntity[] = []
  let entityCounter = 0
  const nextEntityKey = () => entityCounter++

  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n')
  let pendingParagraph: string[] = []

  const flushParagraph = () => {
    if (pendingParagraph.length === 0) return
    pushTextBlock(blocks, entities, nextEntityKey, pendingParagraph.join(' '), 'unstyled')
    pendingParagraph = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      continue
    }

    const imageMatch = trimmed.match(IMAGE_ONLY_RE)
    if (imageMatch) {
      flushParagraph()
      pushImageBlock(blocks, entities, nextEntityKey, imageMatch[1], imageMatch[2].trim(), opts?.images)
      continue
    }

    const headerMatch = trimmed.match(HEADER_RE)
    if (headerMatch) {
      flushParagraph()
      const level = headerMatch[1].length
      const type: DraftJsBlock['type'] =
        level === 1 ? 'header-one' : level === 2 ? 'header-two' : 'header-three'
      pushTextBlock(blocks, entities, nextEntityKey, headerMatch[2], type)
      continue
    }

    const ulMatch = trimmed.match(UL_RE)
    if (ulMatch) {
      flushParagraph()
      pushTextBlock(blocks, entities, nextEntityKey, ulMatch[1], 'unordered-list-item')
      continue
    }

    const olMatch = trimmed.match(OL_RE)
    if (olMatch) {
      flushParagraph()
      pushTextBlock(blocks, entities, nextEntityKey, olMatch[1], 'ordered-list-item')
      continue
    }

    const bqMatch = trimmed.match(BLOCKQUOTE_RE)
    if (bqMatch) {
      flushParagraph()
      pushTextBlock(blocks, entities, nextEntityKey, bqMatch[1], 'blockquote')
      continue
    }

    pendingParagraph.push(trimmed)
  }

  flushParagraph()

  return { blocks, entities }
}
