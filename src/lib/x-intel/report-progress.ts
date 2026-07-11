import { toast } from '../../stores/toast-store'
import {
  estimateExpectedCompletionTokens,
  mapReportStreamProgress,
  streamCallFraction,
  type PriorTokenHint,
  type ReportCallKind,
} from './token-estimate'

const PRESTREAM_COMPUTING_MS = 1000
const PRESTREAM_SENDING_MS = 2000

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

function phaseLabel(phase: ReportCallKind): string {
  return phase === 'narrative' ? 'Writing narrative' : 'Summarizing changes'
}

/**
 * Owns the generate-report toast: stage labels + ballpark bar from streamed
 * token estimates. Completing early (bar < 100%) is fine — complete() snaps full.
 */
export function beginReportProgress(opts: {
  subject: string
  hasChangeStep: boolean
}): ReportProgressHandle {
  const { subject, hasChangeStep } = opts
  const totalSteps = hasChangeStep ? 2 : 1

  const toastId = toast.progress('Generating report', {
    description: subject,
    progress: 0.03,
    progressLabel: 'Computing…',
  })

  let lastProgress = 0.03
  let streamingStarted = false
  const prestreamTimers: ReturnType<typeof setTimeout>[] = []

  const setProgress = (progress: number, progressLabel: string) => {
    // Monotonic bar — never jump backwards if estimates overshoot mid-stream.
    const next = Math.max(lastProgress, Math.min(0.97, progress))
    lastProgress = next
    toast.update(toastId, { progress: next, progressLabel })
  }

  const clearPrestream = () => {
    for (const t of prestreamTimers) clearTimeout(t)
    prestreamTimers.length = 0
  }

  const writingLabel = (phase: ReportCallKind, frac?: number): string => {
    const step = phase === 'narrative' ? 1 : 2
    const base = phaseLabel(phase)
    const pct =
      frac === undefined ? undefined : `… ~${Math.round(frac * 100)}%`
    const suffix = pct ?? '…'
    return totalSteps === 1
      ? `${base}${suffix}`
      : `Step ${step} of ${totalSteps} · ${base}${suffix}`
  }

  const enterStreaming = () => {
    if (streamingStarted) return
    streamingStarted = true
    clearPrestream()
  }

  return {
    toastId,
    markPrepare: () => {
      if (streamingStarted) return
      clearPrestream()
      setProgress(0.04, 'Computing…')
      prestreamTimers.push(
        setTimeout(() => {
          if (streamingStarted) return
          setProgress(0.05, 'Sending…')
          prestreamTimers.push(
            setTimeout(() => {
              if (streamingStarted) return
              setProgress(0.06, 'Waiting…')
            }, PRESTREAM_SENDING_MS),
          )
        }, PRESTREAM_COMPUTING_MS),
      )
    },
    markPhase: (phase) => {
      if (streamingStarted) {
        const base = mapReportStreamProgress(phase, 0, hasChangeStep)
        setProgress(base, writingLabel(phase))
      }
      // Pre-stream: holds own the label until the first token.
    },
    onStreamTokens: (phase, receivedTokens, expectedTokens) => {
      // synthesize emits a 0-token probe before the HTTP call — ignore it so
      // Computing/Sending/Waiting holds can run until the first real SSE delta.
      if (!streamingStarted && receivedTokens <= 0) return
      enterStreaming()
      const frac = streamCallFraction(receivedTokens, expectedTokens)
      const overall = mapReportStreamProgress(phase, frac, hasChangeStep)
      setProgress(overall, writingLabel(phase, frac))
    },
    complete: (title, description) => {
      clearPrestream()
      streamingStarted = true
      toast.complete(toastId, title, description)
    },
    fail: (title, description) => {
      clearPrestream()
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
