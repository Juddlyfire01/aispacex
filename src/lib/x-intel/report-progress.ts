import { joinReportGroup } from './report-progress-group'
import {
  estimateExpectedCompletionTokens,
  mapReportStreamProgress,
  REPORT_PRESTREAM_END,
  streamCallFraction,
  type PriorTokenHint,
  type ReportCallKind,
} from './token-estimate'

const PRESTREAM_COMPUTING_MS = 3000
const PRESTREAM_SENDING_MS = 3000
const PRESTREAM_TICK_MS = 100
/** Soft creep while waiting for first SSE (bar keeps moving, never resets). */
const PRESTREAM_THINKING_CREEP_MS = 12_000
/** Soft creep while waiting for first change-summary SSE. */
const BRIDGE_THINKING_CREEP_MS = 8_000

/** Continuous pre-stream band: Computing → Sending → Thinking → REPORT_PRESTREAM_END. */
const AFTER_COMPUTE = 0.06
const AFTER_SEND = 0.12

function numbered(step: number, total: number, text: string): string {
  return `${step}/${total} · ${text}`
}

/**
 * Yield past the current call stack so React can commit the toast before the
 * stage clock starts. Without this, sync analytics can burn stage 1 before the
 * first paint and the toast appears already on stage 2.
 */
function yieldForToastMount(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

export interface ReportProgressHandle {
  toastId: number
  /**
   * Arm the pre-stream hold clock after the toast has mounted. Resolves once
   * stage 1's 3s timer is running — callers must await this before heavy sync work.
   */
  markPrepare: () => Promise<void>
  /** Arm the active streamed LLM phase (label applies after first token). */
  markPhase: (phase: ReportCallKind) => void
  /** Token progress within the current streamed call. */
  onStreamTokens: (phase: ReportCallKind, receivedTokens: number, expectedTokens: number) => void
  complete: (title: string, description?: string) => void
  fail: (title: string, description?: string) => void
}

function phaseExplainer(phase: ReportCallKind): string {
  return phase === 'narrative' ? 'Writing narrative' : 'Summarizing changes'
}

/**
 * Owns the generate-report toast: numbered stage labels + one continuous bar
 * across Computing → Sending → Thinking → Writing → (Thinking → Summarizing).
 */
export function beginReportProgress(opts: {
  subject: string
  hasChangeStep: boolean
}): ReportProgressHandle {
  const { subject, hasChangeStep } = opts
  /** Pre-stream (3) + writing (+ thinking bridge + summarizing when present). */
  const totalStages = hasChangeStep ? 6 : 4
  const writingStep = 4
  const bridgeThinkingStep = 5
  const changeStep = 6

  // Route through the shared group so concurrent reports coalesce into one
  // toast instead of stacking (and eventually evicting) N separate bars.
  const job = joinReportGroup(subject, numbered(1, totalStages, 'Computing analytics…'))
  const toastId = job.sharedToastId

  let lastProgress = 0.02
  let streamingStarted = false
  /** True after markPhase('change') until first change tokens arrive. */
  let awaitingChangeTokens = false
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0
  let preparePromise: Promise<void> | null = null

  const setProgress = (progress: number, progressLabel: string) => {
    // Monotonic bar — never jump backwards across stages.
    const next = Math.max(lastProgress, Math.min(0.97, progress))
    lastProgress = next
    job.setProgress(next, progressLabel)
  }

  const clearTick = () => {
    if (tickTimer !== null) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  const prestreamProgressAt = (elapsedMs: number): { progress: number; step: number; text: string } => {
    if (elapsedMs < PRESTREAM_COMPUTING_MS) {
      const t = elapsedMs / PRESTREAM_COMPUTING_MS
      return {
        progress: 0.02 + (AFTER_COMPUTE - 0.02) * t,
        step: 1,
        text: 'Computing analytics…',
      }
    }
    if (elapsedMs < PRESTREAM_COMPUTING_MS + PRESTREAM_SENDING_MS) {
      const t = (elapsedMs - PRESTREAM_COMPUTING_MS) / PRESTREAM_SENDING_MS
      return {
        progress: AFTER_COMPUTE + (AFTER_SEND - AFTER_COMPUTE) * t,
        step: 2,
        text: 'Sending request…',
      }
    }
    const thinkElapsed = elapsedMs - PRESTREAM_COMPUTING_MS - PRESTREAM_SENDING_MS
    const t = Math.min(1, thinkElapsed / PRESTREAM_THINKING_CREEP_MS)
    return {
      progress: AFTER_SEND + (REPORT_PRESTREAM_END - AFTER_SEND) * t,
      step: 3,
      text: 'Thinking…',
    }
  }

  const writingLabel = (phase: ReportCallKind, overallProgress?: number): string => {
    const step = phase === 'narrative' ? writingStep : changeStep
    const base = phaseExplainer(phase)
    // Overall job % (not per-phase) so summarizing continues from writing, not ~0%.
    const pct =
      overallProgress === undefined
        ? undefined
        : `… ~${Math.round(overallProgress * 100)}%`
    return numbered(step, totalStages, `${base}${pct ?? '…'}`)
  }

  const enterStreaming = () => {
    if (streamingStarted) return
    streamingStarted = true
    clearTick()
  }

  const paintPrestream = () => {
    if (streamingStarted || startedAt === 0) return
    const elapsed = Date.now() - startedAt
    const { progress, step, text } = prestreamProgressAt(elapsed)
    setProgress(progress, numbered(step, totalStages, text))
  }

  const startBridgeThinking = () => {
    awaitingChangeTokens = true
    clearTick()
    const floor = Math.max(lastProgress, mapReportStreamProgress('change', 0, true))
    const ceiling = Math.min(0.78, floor + 0.06)
    setProgress(floor, numbered(bridgeThinkingStep, totalStages, 'Thinking…'))
    const bridgeStarted = Date.now()
    const bridgeStartProgress = lastProgress
    tickTimer = setInterval(() => {
      if (!awaitingChangeTokens) {
        clearTick()
        return
      }
      const t = Math.min(1, (Date.now() - bridgeStarted) / BRIDGE_THINKING_CREEP_MS)
      setProgress(
        bridgeStartProgress + (ceiling - bridgeStartProgress) * t,
        numbered(bridgeThinkingStep, totalStages, 'Thinking…'),
      )
      if (t >= 1) clearTick()
    }, PRESTREAM_TICK_MS)
  }

  return {
    toastId,
    markPrepare: () => {
      if (streamingStarted) return Promise.resolve()
      if (preparePromise) return preparePromise
      preparePromise = yieldForToastMount().then(() => {
        if (streamingStarted || startedAt !== 0) return
        // Clock starts at mount — not when generateReport() entered.
        startedAt = Date.now()
        paintPrestream()
        tickTimer = setInterval(() => {
          if (streamingStarted) {
            clearTick()
            return
          }
          paintPrestream()
        }, PRESTREAM_TICK_MS)
      })
      return preparePromise
    },
    markPhase: (phase) => {
      if (phase === 'change' && hasChangeStep) {
        // Bridge between writing and summarizing while waiting for first SSE.
        startBridgeThinking()
        return
      }
      if (streamingStarted) {
        const base = mapReportStreamProgress(phase, 0, hasChangeStep)
        setProgress(base, writingLabel(phase, Math.max(lastProgress, base)))
      }
    },
    onStreamTokens: (phase, receivedTokens, expectedTokens) => {
      // synthesize emits a 0-token probe before each HTTP call — ignore so
      // Thinking holds can run until the first real SSE delta.
      if (receivedTokens <= 0) return
      if (phase === 'change') {
        awaitingChangeTokens = false
        clearTick()
      }
      enterStreaming()
      const frac = streamCallFraction(receivedTokens, expectedTokens)
      const overall = mapReportStreamProgress(phase, frac, hasChangeStep)
      const next = Math.max(lastProgress, Math.min(0.97, overall))
      setProgress(overall, writingLabel(phase, next))
    },
    complete: (title, description) => {
      clearTick()
      streamingStarted = true
      awaitingChangeTokens = false
      job.complete(title, description)
    },
    fail: (title, description) => {
      clearTick()
      streamingStarted = true
      awaitingChangeTokens = false
      job.fail(title, description)
    },
  }
}

/** Build the prior-token hint used for expected-completion ballpark. */
export function priorTokenHintFromSnapshot(meta: {
  promptTokens?: number
  completionTokens?: number
  tokenCost?: number
} | null | undefined): PriorTokenHint | null {
  if (!meta) return null
  return {
    promptTokens: meta.promptTokens,
    completionTokens: meta.completionTokens,
    tokenCost: meta.tokenCost,
  }
}

export function expectedOutForCall(
  kind: ReportCallKind,
  promptTokens: number,
  prior: PriorTokenHint | null,
  priorIncludedChange: boolean,
): number {
  return estimateExpectedCompletionTokens({
    kind,
    promptTokens,
    prior,
    priorIncludedChange,
  })
}
