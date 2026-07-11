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

/** Soft bounds for structured report JSON (ballpark, not a hard cap). */
const NARRATIVE_OUT_MIN = 900
const NARRATIVE_OUT_MAX = 3200
const CHANGE_OUT_MIN = 120
const CHANGE_OUT_MAX = 700

/** When no prior exists: completion ≈ this fraction of prompt size. */
const NARRATIVE_OUT_RATIO = 0.22
const CHANGE_OUT_RATIO = 0.35

/**
 * When a prior snapshot's completion tokens include both narrative + change
 * calls, attribute this share to the main narrative call.
 */
const PRIOR_NARRATIVE_SHARE = 0.85

export type ReportCallKind = 'narrative' | 'change'

export interface PriorTokenHint {
  promptTokens?: number
  completionTokens?: number
  tokenCost?: number
}

/**
 * Ballpark expected *completion* tokens for a report synthesis call.
 * Prefer a same-job prior when available; otherwise derive from prompt size
 * and clamp to schema-shaped soft min/max. Fine to overshoot — UI caps the bar.
 */
export function estimateExpectedCompletionTokens(opts: {
  kind: ReportCallKind
  promptTokens: number
  /** Prior report meta tokens, if any. */
  prior?: PriorTokenHint | null
  /** Prior run also ran a change-summary call (split prior completion). */
  priorIncludedChange?: boolean
}): number {
  const { kind, promptTokens, prior, priorIncludedChange = false } = opts
  const softMin = kind === 'narrative' ? NARRATIVE_OUT_MIN : CHANGE_OUT_MIN
  const softMax = kind === 'narrative' ? NARRATIVE_OUT_MAX : CHANGE_OUT_MAX
  const ratio = kind === 'narrative' ? NARRATIVE_OUT_RATIO : CHANGE_OUT_RATIO

  let fromPrior: number | null = null
  if (prior) {
    let priorOut = prior.completionTokens
    if ((priorOut == null || priorOut <= 0) && prior.tokenCost != null && prior.promptTokens != null) {
      priorOut = Math.max(0, prior.tokenCost - prior.promptTokens)
    }
    if (priorOut != null && priorOut > 0) {
      if (kind === 'narrative') {
        fromPrior = priorIncludedChange ? priorOut * PRIOR_NARRATIVE_SHARE : priorOut
      } else {
        fromPrior = priorIncludedChange ? priorOut * (1 - PRIOR_NARRATIVE_SHARE) : priorOut * 0.2
      }
    }
  }

  const fromPrompt = Math.max(0, promptTokens) * ratio
  const raw = fromPrior ?? fromPrompt
  return Math.round(Math.min(softMax, Math.max(softMin, raw || softMin)))
}

/**
 * Map received completion tokens → 0..0.97 within a single streamed call.
 * Never reaches 1.0 so finishing early always feels like a win when we snap complete.
 */
export function streamCallFraction(receivedTokens: number, expectedTokens: number): number {
  if (expectedTokens <= 0) return 0
  return Math.min(0.97, Math.max(0, receivedTokens / expectedTokens))
}

/** End of pre-stream band (Computing → Sending → Waiting). Stream phases continue from here. */
export const REPORT_PRESTREAM_END = 0.18
const REPORT_NARRATIVE_END_WITH_CHANGE = 0.70
const REPORT_STREAM_CAP = 0.97

/**
 * Map a call's stream fraction into overall report-job progress (0–1).
 * Continues after the pre-stream band — bar never resets between stages.
 */
export function mapReportStreamProgress(
  phase: ReportCallKind,
  streamFrac: number,
  hasChangeStep: boolean,
): number {
  const f = Math.min(1, Math.max(0, streamFrac))
  if (!hasChangeStep) {
    // Pre-stream end → ~97% across narrative
    return REPORT_PRESTREAM_END + f * (REPORT_STREAM_CAP - REPORT_PRESTREAM_END)
  }
  if (phase === 'narrative') {
    // Pre-stream end → ~70%
    return REPORT_PRESTREAM_END + f * (REPORT_NARRATIVE_END_WITH_CHANGE - REPORT_PRESTREAM_END)
  }
  // ~70% → ~97%
  return REPORT_NARRATIVE_END_WITH_CHANGE + f * (REPORT_STREAM_CAP - REPORT_NARRATIVE_END_WITH_CHANGE)
}
