// What X accepts in POST /2/tweets `text` (see docs.x.com/fundamentals/counting-characters
// and docs.x.com/x-api/posts/create-post):
//
// • Plain UTF-8 (NFC), including newlines
// • Auto-parsed entities: @mentions, #hashtags, $cashtags, URLs (t.co, 23 chars each)
// • Emojis (each counts as 2 toward the 280 weighted limit)
// • CJK and most non-Latin Unicode (weight 2)
// • No Markdown, HTML, or rich-text API fields on standard posts
//
// Bold/italic in the X app are Unicode Mathematical Alphanumeric Symbols — separate
// code points, not markup. Articles API supports bold/italic/strikethrough via
// DraftJS, but our composer posts standard tweets.

export type XTextStyle = 'bold' | 'italic'

const BOLD_UPPER = 0x1d400
const BOLD_LOWER = 0x1d41a
const BOLD_DIGIT = 0x1d7ce
const ITALIC_UPPER = 0x1d434
const ITALIC_LOWER = 0x1d44e

/** Convert A–Z, a–z, 0–9 to mathematical bold; leave everything else unchanged. */
export function toMathematicalBold(text: string): string {
  return mapChars(text, (code) => {
    if (code >= 0x41 && code <= 0x5a) return BOLD_UPPER + (code - 0x41)
    if (code >= 0x61 && code <= 0x7a) return BOLD_LOWER + (code - 0x61)
    if (code >= 0x30 && code <= 0x39) return BOLD_DIGIT + (code - 0x30)
    return null
  })
}

/** Convert A–Z, a–z to mathematical italic; leave digits and other chars unchanged. */
export function toMathematicalItalic(text: string): string {
  return mapChars(text, (code) => {
    if (code >= 0x41 && code <= 0x5a) return ITALIC_UPPER + (code - 0x41)
    if (code >= 0x61 && code <= 0x7a) return ITALIC_LOWER + (code - 0x61)
    return null
  })
}

/** Strip mathematical bold/italic back to ASCII letters and digits where possible. */
export function toPlainAscii(text: string): string {
  return mapChars(text, (code) => {
    if (code >= BOLD_UPPER && code <= BOLD_UPPER + 25) return 0x41 + (code - BOLD_UPPER)
    if (code >= BOLD_LOWER && code <= BOLD_LOWER + 25) return 0x61 + (code - BOLD_LOWER)
    if (code >= BOLD_DIGIT && code <= BOLD_DIGIT + 9) return 0x30 + (code - BOLD_DIGIT)
    if (code >= ITALIC_UPPER && code <= ITALIC_UPPER + 25) return 0x41 + (code - ITALIC_UPPER)
    if (code >= ITALIC_LOWER && code <= ITALIC_LOWER + 25) return 0x61 + (code - ITALIC_LOWER)
    return null
  })
}

export function applyXTextStyle(text: string, style: XTextStyle): string {
  return style === 'bold' ? toMathematicalBold(text) : toMathematicalItalic(text)
}

function mapChars(text: string, map: (code: number) => number | null): string {
  return [...text]
    .map((ch) => {
      const code = ch.codePointAt(0)!
      const mapped = map(code)
      return mapped === null ? ch : String.fromCodePoint(mapped)
    })
    .join('')
}

export interface TextareaSelectionEdit {
  value: string
  selectionStart: number
  selectionEnd: number
}

/** Replace the current textarea selection (or insert at cursor). */
export function replaceSelection(
  current: string,
  start: number,
  end: number,
  insert: string,
): TextareaSelectionEdit {
  const value = current.slice(0, start) + insert + current.slice(end)
  const cursor = start + insert.length
  return { value, selectionStart: cursor, selectionEnd: cursor }
}

/** Wrap selection with prefix/suffix, or insert both at cursor when empty. */
export function wrapSelection(
  current: string,
  start: number,
  end: number,
  prefix: string,
  suffix = '',
): TextareaSelectionEdit {
  const selected = current.slice(start, end)
  const insert = selected ? `${prefix}${selected}${suffix}` : `${prefix}${suffix}`
  const value = current.slice(0, start) + insert + current.slice(end)
  if (selected) {
    return { value, selectionStart: start + prefix.length, selectionEnd: start + prefix.length + selected.length }
  }
  const cursor = start + prefix.length
  return { value, selectionStart: cursor, selectionEnd: cursor }
}

export const X_FORMAT_GUIDE = [
  { label: 'Bold / italic', detail: 'Unicode styled letters (A–Z, a–z); not Markdown ** or _' },
  { label: '@mention', detail: '@username — links the account; counts toward limit' },
  { label: '#hashtag', detail: '#topic — discoverable tag; # counts' },
  { label: '$cashtag', detail: '$VVV — ticker symbol entity' },
  { label: 'Links', detail: 'Plain https://… URLs; each counts as 23 characters' },
  { label: 'Emojis', detail: 'Any emoji; each counts as 2 characters' },
  { label: 'Line breaks', detail: 'Shift+Enter or toolbar ↵' },
] as const
