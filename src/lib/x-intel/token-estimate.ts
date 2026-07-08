/**
 * Pre-send token ESTIMATION for report synthesis payloads.
 *
 * IMPORTANT: this is an estimate, not an exact count. Providers only report
 * exact token usage AFTER a call (see IntelReportSnapshot.meta.tokenCost, which
 * is the real Venice `usage.total_tokens`). Before sending we can only
 * approximate, because the payload hasn't been tokenized by the model yet and
 * Venice serves many models with different tokenizers.
 *
 * Heuristic: ~4 characters per token for typical English + light JSON, with a
 * small per-message overhead for role/formatting framing. Empirically this lands
 * within ~10–15% for the mixed prose+JSON payloads we send. Callers should label
 * the result as an estimate (e.g. "~1.2K tokens").
 */

const CHARS_PER_TOKEN = 4
/** Chat framing overhead (role markers, delimiters) charged per message. */
const PER_MESSAGE_TOKENS = 4

export interface EstimatorMessage {
  role: string
  content: string
}

/** Estimate tokens for a single string of text. */
export function estimateTextTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate the prompt-token count for a set of chat messages. Sums per-message
 * content estimates plus a fixed framing overhead per message. Output tokens are
 * NOT included — this is the input/payload cost, which is what the live counter
 * in synthesis settings reflects.
 */
export function estimateMessagesTokens(messages: EstimatorMessage[]): number {
  return messages.reduce(
    (sum, m) => sum + PER_MESSAGE_TOKENS + estimateTextTokens(m.content),
    0,
  )
}
