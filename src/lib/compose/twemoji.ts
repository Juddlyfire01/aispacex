// Twemoji PNGs for consistent emoji rendering when the OS font lacks a glyph (common on
// Windows 10 for Unicode 14+ emoji like 🫠). Posts still insert native Unicode for X.

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72'

export function twemojiUrl(unified: string): string {
  return `${TWEMOJI_BASE}/${unified.toLowerCase()}.png`
}
