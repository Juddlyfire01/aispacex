import {
  markdownToContentState,
  type DraftJsContentState,
  type DraftJsBlock,
  type DraftJsEntity,
} from './article-draftjs'
import { splitArticleImagePrompt } from './article-parse'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function applyInlineStyles(
  text: string,
  styles: NonNullable<DraftJsBlock['inline_style_ranges']> | undefined,
): string {
  if (!styles || styles.length === 0) return escapeHtml(text)

  type Mark = { at: number; open: boolean; style: string; order: number }
  const marks: Mark[] = []
  styles.forEach((r, i) => {
    marks.push({ at: r.offset, open: true, style: r.style, order: i })
    marks.push({ at: r.offset + r.length, open: false, style: r.style, order: i })
  })
  marks.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at
    if (a.open !== b.open) return a.open ? 1 : -1
    return b.order - a.order
  })

  const tag = (style: string, open: boolean) => {
    const t = style === 'bold' ? 'strong' : style === 'italic' ? 'em' : 's'
    return open ? `<${t}>` : `</${t}>`
  }

  let out = ''
  let cursor = 0
  for (const m of marks) {
    if (m.at > cursor) {
      out += escapeHtml(text.slice(cursor, m.at))
      cursor = m.at
    }
    out += tag(m.style, m.open)
  }
  out += escapeHtml(text.slice(cursor))
  return out
}

function blockInnerHtml(block: DraftJsBlock, entities: DraftJsEntity[]): string {
  const text = block.text
  const styles = block.inline_style_ranges
  const ranges = [...(block.entity_ranges ?? [])].sort((a, b) => a.offset - b.offset)

  if (ranges.length === 0) return applyInlineStyles(text, styles)

  type Seg = { start: number; end: number; entityKey?: number }
  const segs: Seg[] = []
  let cursor = 0
  for (const r of ranges) {
    if (r.offset > cursor) segs.push({ start: cursor, end: r.offset })
    segs.push({ start: r.offset, end: r.offset + r.length, entityKey: r.key })
    cursor = r.offset + r.length
  }
  if (cursor < text.length) segs.push({ start: cursor, end: text.length })

  return segs
    .map((seg) => {
      const slice = text.slice(seg.start, seg.end)
      const localStyles = (styles ?? [])
        .map((s) => {
          const start = Math.max(s.offset, seg.start)
          const end = Math.min(s.offset + s.length, seg.end)
          if (end <= start) return null
          return { offset: start - seg.start, length: end - start, style: s.style as 'bold' | 'italic' | 'strikethrough' }
        })
        .filter(Boolean) as NonNullable<DraftJsBlock['inline_style_ranges']>
      let inner = applyInlineStyles(slice, localStyles)
      if (seg.entityKey !== undefined) {
        const ent = entities.find((e) => e.key === String(seg.entityKey) || Number(e.key) === seg.entityKey)
        if (ent?.value.type === 'link' && typeof ent.value.data.url === 'string') {
          const url = escapeHtml(ent.value.data.url)
          inner = `<a href="${url}">${inner}</a>`
        }
      }
      return inner
    })
    .join('')
}

/** Convert DraftJS content_state to HTML suitable for preview / clipboard paste. */
export function contentStateToHtml(cs: DraftJsContentState): string {
  const parts: string[] = []
  let i = 0
  while (i < cs.blocks.length) {
    const block = cs.blocks[i]!
    if (block.type === 'unordered-list-item' || block.type === 'ordered-list-item') {
      const listType = block.type
      const tag = listType === 'unordered-list-item' ? 'ul' : 'ol'
      const items: string[] = []
      while (i < cs.blocks.length && cs.blocks[i]!.type === listType) {
        const b = cs.blocks[i]!
        items.push(`<li>${blockInnerHtml(b, cs.entities)}</li>`)
        i++
      }
      parts.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }
    if (block.type === 'atomic') {
      i++
      continue
    }
    const inner = blockInnerHtml(block, cs.entities)
    if (block.type === 'header-one') parts.push(`<h1>${inner}</h1>`)
    else if (block.type === 'header-two') parts.push(`<h2>${inner}</h2>`)
    else if (block.type === 'header-three') parts.push(`<h3>${inner}</h3>`)
    else if (block.type === 'blockquote') parts.push(`<blockquote>${inner}</blockquote>`)
    else parts.push(`<p>${inner || '<br>'}</p>`)
    i++
  }
  return parts.join('')
}

export function markdownToArticleHtml(md: string): string {
  const { body } = splitArticleImagePrompt(md ?? '')
  return contentStateToHtml(markdownToContentState(body))
}

/** Plain text mirror of article body (no markdown markers). */
export function markdownToArticlePlain(md: string): string {
  const { body } = splitArticleImagePrompt(md ?? '')
  const cs = markdownToContentState(body)
  const lines: string[] = []
  for (const b of cs.blocks) {
    if (b.type === 'atomic') continue
    const t = b.text.trim()
    if (!t) continue
    lines.push(t)
  }
  return lines.join('\n\n')
}

function nodeName(n: Node): string {
  return n.nodeType === Node.ELEMENT_NODE ? (n as Element).tagName.toLowerCase() : ''
}

function isBlockTag(tag: string): boolean {
  return (
    tag === 'p' ||
    tag === 'div' ||
    tag === 'h1' ||
    tag === 'h2' ||
    tag === 'h3' ||
    tag === 'blockquote' ||
    tag === 'li' ||
    tag === 'ul' ||
    tag === 'ol' ||
    tag === 'br'
  )
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const kids = Array.from(el.childNodes).map(serializeInline).join('')
  if (tag === 'br') return '\n'
  if (tag === 'strong' || tag === 'b') return kids ? `**${kids}**` : ''
  if (tag === 'em' || tag === 'i') return kids ? `*${kids}*` : ''
  if (tag === 's' || tag === 'strike' || tag === 'del') return kids ? `~~${kids}~~` : ''
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? ''
    return href ? `[${kids}](${href})` : kids
  }
  return kids
}

/** Convert editor HTML back to markdown for storage / DraftJS publish path. */
export function articleHtmlToMarkdown(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return htmlToMarkdownFallback(html)
  }

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return ''

  const lines: string[] = []

  const walkBlocks = (parent: Element) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = (child.textContent ?? '').trim()
        if (t) lines.push(t)
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      const tag = el.tagName.toLowerCase()
      if (tag === 'ul') {
        for (const li of Array.from(el.children)) {
          if (nodeName(li) === 'li') lines.push(`- ${serializeInline(li).trim()}`)
        }
        continue
      }
      if (tag === 'ol') {
        let n = 1
        for (const li of Array.from(el.children)) {
          if (nodeName(li) === 'li') {
            lines.push(`${n}. ${serializeInline(li).trim()}`)
            n++
          }
        }
        continue
      }
      if (tag === 'h1') {
        lines.push(`# ${serializeInline(el).trim()}`)
        continue
      }
      if (tag === 'h2') {
        lines.push(`## ${serializeInline(el).trim()}`)
        continue
      }
      if (tag === 'h3') {
        lines.push(`### ${serializeInline(el).trim()}`)
        continue
      }
      if (tag === 'blockquote') {
        const inner = serializeInline(el).trim()
        lines.push(
          inner
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n'),
        )
        continue
      }
      if (tag === 'br') {
        lines.push('')
        continue
      }
      if (tag === 'p' || tag === 'div') {
        const hasBlockKids = Array.from(el.children).some((c) => isBlockTag(c.tagName.toLowerCase()))
        if (hasBlockKids) {
          walkBlocks(el)
        } else {
          const t = serializeInline(el).trim()
          if (t) lines.push(t)
        }
        continue
      }
      const t = serializeInline(el).trim()
      if (t) lines.push(t)
    }
  }

  walkBlocks(root)
  return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Regex fallback when DOMParser is unavailable (Node tests). */
function htmlToMarkdownFallback(html: string): string {
  let s = html
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `# ${inlineFallback(t)}\n\n`)
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `## ${inlineFallback(t)}\n\n`)
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `### ${inlineFallback(t)}\n\n`)
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => `> ${inlineFallback(t)}\n\n`)
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${inlineFallback(t)}\n`)
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `${inlineFallback(t)}\n\n`)
  s = s.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, (_, t) => `${inlineFallback(t)}\n\n`)
  s = inlineFallback(s)
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

function inlineFallback(html: string): string {
  return html
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<(s|strike|del)[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}
