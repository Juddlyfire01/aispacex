import { toast } from '../../stores/toast-store'
import {
  estimateExpectedCompletionTokens,
  mapReportStreamProgress,
  streamCallFraction,
  type PriorTokenHint,
  type ReportCallKind,
} from './token-estimate'

export interface ReportProgressHandle {
  toastId: number
  /** Thin prepare stage (analytics) — may only paint for a frame. */
  markPrepare: () => void
  /** Start of a streamed LLM call. */
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
    progressLabel: hasChangeStep
      ? 'Preparing · then narrative + changes'
      : 'Preparing · then writing narrative',
  })

  let lastProgress = 0.03

  const setProgress = (progress: number, progressLabel: string) => {
    // Monotonic bar — never jump backwards if estimates overshoot mid-stream.
    const next = Math.max(lastProgress, Math.min(0.97, progress))
    lastProgress = next
    toast.update(toastId, { progress: next, progressLabel })
  }

  return {
    toastId,
    markPrepare: () => {
      setProgress(0.04, 'Computing analytics…')
    },
    markPhase: (phase) => {
      const step = phase === 'narrative' ? 1 : 2
      const base = mapReportStreamProgress(phase, 0, hasChangeStep)
      setProgress(
        base,
        totalSteps === 1
          ? `${phaseLabel(phase)}…`
          : `Step ${step} of ${totalSteps} · ${phaseLabel(phase)}…`,
      )
    },
    onStreamTokens: (phase, receivedTokens, expectedTokens) => {
      const frac = streamCallFraction(receivedTokens, expectedTokens)
      const overall = mapReportStreamProgress(phase, frac, hasChangeStep)
      const step = phase === 'narrative' ? 1 : 2
      const pct = Math.round(frac * 100)
      const label =
        totalSteps === 1
          ? `${phaseLabel(phase)}… ~${pct}%`
          : `Step ${step} of ${totalSteps} · ${phaseLabel(phase)}… ~${pct}%`
      setProgress(overall, label)
    },
    complete: (title, description) => toast.complete(toastId, title, description),
    fail: (title, description) => toast.fail(toastId, title, description),
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
