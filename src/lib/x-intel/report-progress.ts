import { toast } from '../../stores/toast-store'
import {
  estimateExpectedCompletionTokens,
  mapReportStreamProgress,
  REPORT_PRESTREAM_END,
  streamCallFraction,
  type PriorTokenHint,
  type ReportCallKind,
} from './token-estimate'

const PRESTREAM_COMPUTING_MS = 1000
const PRESTREAM_SENDING_MS = 2000
const PRESTREAM_TICK_MS = 100
/** Soft creep while waiting for first SSE (bar keeps moving, never resets). */
const PRESTREAM_WAITING_CREEP_MS = 12_000

/** Continuous pre-stream band: Computing → Sending → Waiting → REPORT_PRESTREAM_END. */
const AFTER_COMPUTE = 0.06
const AFTER_SEND = 0.12

function numbered(step: number, total: number, text: string): string {
  return `${step}/${total} · ${text}`
}

export interface ReportProgressHandle {
  toastId: number
  /** Start pre-stream hold schedule (Computing → Sending → Waiting). */
  markPrepare: () => void
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
 * across Computing → Sending → Waiting → Writing → (optional) Summarizing.
 */
export function beginReportProgress(opts: {
  subject: string
  hasChangeStep: boolean
}): ReportProgressHandle {
  const { subject, hasChangeStep } = opts
  /** Pre-stream (3) + writing (+ summarizing when present). */
  const totalStages = hasChangeStep ? 5 : 4
  const writingStep = 4
  const changeStep = 5

  const toastId = toast.progress('Generating report', {
    description: subject,
    progress: 0.02,
    progressLabel: numbered(1, totalStages, 'Computing analytics…'),
  })

  let lastProgress = 0.02
  let streamingStarted = false
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0

  const setProgress = (progress: number, progressLabel: string) => {
    // Monotonic bar — never jump backwards across stages.
    const next = Math.max(lastProgress, Math.min(0.97, progress))
    lastProgress = next
    toast.update(toastId, { progress: next, progressLabel })
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
    const waitElapsed = elapsedMs - PRESTREAM_COMPUTING_MS - PRESTREAM_SENDING_MS
    const t = Math.min(1, waitElapsed / PRESTREAM_WAITING_CREEP_MS)
    return {
      progress: AFTER_SEND + (REPORT_PRESTREAM_END - AFTER_SEND) * t,
      step: 3,
      text: 'Waiting for first tokens…',
    }
  }

  const writingLabel = (phase: ReportCallKind, frac?: number): string => {
    const step = phase === 'narrative' ? writingStep : changeStep
    const base = phaseExplainer(phase)
    const pct = frac === undefined ? undefined : `… ~${Math.round(frac * 100)}%`
    return numbered(step, totalStages, `${base}${pct ?? '…'}`)
  }

  const enterStreaming = () => {
    if (streamingStarted) return
    streamingStarted = true
    clearTick()
  }

  return {
    toastId,
    markPrepare: () => {
      if (streamingStarted) return
      clearTick()
      startedAt = Date.now()
      const paint = () => {
        if (streamingStarted) {
          clearTick()
          return
        }
        const elapsed = Date.now() - startedAt
        const { progress, step, text } = prestreamProgressAt(elapsed)
        setProgress(progress, numbered(step, totalStages, text))
      }
      paint()
      tickTimer = setInterval(paint, PRESTREAM_TICK_MS)
    },
    markPhase: (phase) => {
      if (streamingStarted) {
        const base = mapReportStreamProgress(phase, 0, hasChangeStep)
        setProgress(base, writingLabel(phase))
      }
    },
    onStreamTokens: (phase, receivedTokens, expectedTokens) => {
      // synthesize emits a 0-token probe before the HTTP call — ignore it so
      // pre-stream holds can run until the first real SSE delta.
      if (!streamingStarted && receivedTokens <= 0) return
      enterStreaming()
      const frac = streamCallFraction(receivedTokens, expectedTokens)
      const overall = mapReportStreamProgress(phase, frac, hasChangeStep)
      setProgress(overall, writingLabel(phase, frac))
    },
    complete: (title, description) => {
      clearTick()
      streamingStarted = true
      toast.complete(toastId, title, description)
    },
    fail: (title, description) => {
      clearTick()
      streamingStarted = true
      toast.fail(toastId, title, description)
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
