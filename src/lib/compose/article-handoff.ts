const DRAFT_INTENT_RE =
  /\b(draft|write|rewrite|revise|compose|hand\s*off|use\s+the\s+draft\s+tool|postdraft|article\s+for\s+x)\b/i

/** True when the user message looks like a request to produce publishable copy. */
export function looksLikeDraftIntent(userMessage: string): boolean {
  return DRAFT_INTENT_RE.test(userMessage)
}
