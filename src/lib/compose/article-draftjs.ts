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
const IMAGE_INLINE_RE = /!\[([^\]]*)\]\(media:([^)]+)\)/g
const HR_RE = /^-{3,}$/

type InlineStyle = 'bold' | 'italic' | 'strikethrough'

/** Parse links + bold/italic/strike into DraftJS ranges. Code ticks become plain text. */
function parseInline(
  text: string,
  nextEntityKey: () => number,
  entities: DraftJsEntity[],
): {
  text: string
  entity_ranges: NonNullable<DraftJsBlock['entity_ranges']>
  inline_style_ranges: NonNullable<DraftJsBlock['inline_style_ranges']>
} {
  const entity_ranges: NonNullable<DraftJsBlock['entity_ranges']> = []
  const inline_style_ranges: NonNullable<DraftJsBlock['inline_style_ranges']> = []
  let out = ''
  let i = 0

  const pushStyled = (plain: string, style?: InlineStyle) => {
    if (!plain) return
    const offset = out.length
    out += plain
    if (style) inline_style_ranges.push({ offset, length: plain.length, style })
  }

  const parseChunk = (chunk: string, inherited?: InlineStyle) => {
    let j = 0
    while (j < chunk.length) {
      // [label](url)
      if (chunk[j] === '[') {
        const close = chunk.indexOf('](', j)
        if (close !== -1) {
          const endUrl = chunk.indexOf(')', close + 2)
          if (endUrl !== -1) {
            const label = chunk.slice(j + 1, close)
            const url = chunk.slice(close + 2, endUrl)
            const offset = out.length
            // Recurse label for nested styles without creating nested links
            const beforeLen = out.length
            parseChunk(label, inherited)
            const labelLen = out.length - beforeLen
            if (labelLen > 0) {
              const key = nextEntityKey()
              entities.push({
                key: String(key),
                value: { type: 'link', mutability: 'mutable', data: { url } },
              })
              entity_ranges.push({ key, offset, length: labelLen })
            }
            j = endUrl + 1
            continue
          }
        }
      }

      // **bold** or __bold__
      if (
        (chunk.startsWith('**', j) || chunk.startsWith('__', j)) &&
        chunk.length > j + 2
      ) {
        const delim = chunk.slice(j, j + 2)
        const end = chunk.indexOf(delim, j + 2)
        if (end !== -1) {
          parseChunk(chunk.slice(j + 2, end), 'bold')
          j = end + 2
          continue
        }
      }

      // ~~strike~~
      if (chunk.startsWith('~~', j)) {
        const end = chunk.indexOf('~~', j + 2)
        if (end !== -1) {
          parseChunk(chunk.slice(j + 2, end), 'strikethrough')
          j = end + 2
          continue
        }
      }

      // *italic* or _italic_ (single)
      if (chunk[j] === '*' || chunk[j] === '_') {
        const delim = chunk[j]!
        if (chunk[j + 1] !== delim) {
          const end = chunk.indexOf(delim, j + 1)
          if (end !== -1 && (delim !== '_' || (!/\w/.test(chunk[j - 1] ?? '') && !/\w/.test(chunk[end + 1] ?? '')))) {
            parseChunk(chunk.slice(j + 1, end), 'italic')
            j = end + 1
            continue
          }
        }
      }

      // `code` → plain
      if (chunk[j] === '`') {
        const end = chunk.indexOf('`', j + 1)
        if (end !== -1) {
          pushStyled(chunk.slice(j + 1, end), inherited)
          j = end + 1
          continue
        }
      }

      // plain run until next special
      let k = j + 1
      while (k < chunk.length && !'*_~[`'.includes(chunk[k]!)) k++
      pushStyled(chunk.slice(j, k), inherited)
      j = k
    }
  }

  parseChunk(text)
  return { text: out, entity_ranges, inline_style_ranges }
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

  const { text, entity_ranges, inline_style_ranges } = parseInline(
    withoutImages,
    nextEntityKey,
    entities,
  )
  if (!text) return

  const block: DraftJsBlock = { text, type }
  if (entity_ranges.length > 0) block.entity_ranges = entity_ranges
  if (inline_style_ranges.length > 0) block.inline_style_ranges = inline_style_ranges
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
    const fallback = alt.trim()
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

    // Horizontal rules from writers — not an X Article block type.
    if (HR_RE.test(trimmed)) {
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
