import { toast, type ToastVariant } from '../../stores/toast-store'

/**
 * Coalesces concurrent report-generation jobs into ONE shared toast.
 *
 * With a single active job the shared toast reads exactly like the legacy
 * per-report toast (subject + stage label + that job's bar). As soon as a
 * second job joins, it flips to an aggregate: "Generating N reports" with an
 * averaged bar and a "M of N complete" aux line. This keeps the bottom-right
 * stack at a fixed height no matter how many targets generate at once, and —
 * combined with the variant-aware eviction fix — guarantees no running job's
 * outcome is ever silently dropped.
 *
 * The group is intentionally module-global (like the toast store itself):
 * report jobs are fire-and-forget and can be launched from unrelated views.
 */

export type JobStatus = 'running' | 'success' | 'error'

interface Job {
  id: number
  /** e.g. "@alice" — used as the subject when only one job is active. */
  subject: string
  progress: number
  /** Stage label for the single-job view, e.g. "4/6 · Writing narrative…". */
  label: string
  status: JobStatus
  /** Final title/description captured on settle (single-job view surfaces it). */
  outcomeTitle?: string
  outcomeDescription?: string
}

const SUCCESS_LINGER_MS = 4500
const ERROR_LINGER_MS = 12_000

let jobCounter = 0
let toastId: number | null = null
const jobs = new Map<number, Job>()
let settleTimer: ReturnType<typeof setTimeout> | null = null

function clearSettleTimer() {
  if (settleTimer !== null) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}

function activeJobs(): Job[] {
  return [...jobs.values()].filter((j) => j.status === 'running')
}

function allSettled(): boolean {
  return jobs.size > 0 && activeJobs().length === 0
}

/** Averaged progress across every member (settled jobs count as 1.0). */
function aggregateProgress(): number {
  if (jobs.size === 0) return 0
  let sum = 0
  for (const j of jobs.values()) sum += j.status === 'running' ? j.progress : 1
  return sum / jobs.size
}

function ensureToast(subject: string, label: string): void {
  if (toastId !== null) return
  toastId = toast.progress('Generating report', {
    description: subject,
    progress: 0.02,
    progressLabel: label,
  })
}

/**
 * Repaint the shared toast from current job state. Single active job → legacy
 * look; multiple → aggregate summary. No-op once the toast has been released.
 */
function render(): void {
  if (toastId === null) return

  const settled = allSettled()
  if (settled) {
    renderSettled()
    return
  }

  const running = activeJobs()
  const total = jobs.size
  const done = total - running.length

  if (total === 1) {
    const only = running[0] ?? [...jobs.values()][0]
    toast.update(toastId, {
      title: 'Generating report',
      description: only.subject,
      progress: only.progress,
      progressLabel: only.label,
    })
    return
  }

  const doneSuffix = done > 0 ? ` · ${done} of ${total} complete` : ''
  toast.update(toastId, {
    title: `Generating ${total} reports`,
    description: running.map((j) => j.subject).join(', '),
    progress: aggregateProgress(),
    progressLabel: `Running ${running.length} of ${total}${doneSuffix}`,
  })
}

/** Terminal repaint once every member has settled, then reset the group. */
function renderSettled(): void {
  if (toastId === null) return
  const all = [...jobs.values()]
  const failures = all.filter((j) => j.status === 'error')
  const successes = all.filter((j) => j.status === 'success')

  if (all.length === 1) {
    // Preserve the exact single-report outcome surface.
    const only = all[0]
    if (only.status === 'error') {
      toast.fail(toastId, only.outcomeTitle ?? 'Report failed', only.outcomeDescription)
    } else {
      toast.complete(toastId, only.outcomeTitle ?? 'Report ready', only.outcomeDescription)
    }
  } else if (failures.length === 0) {
    toast.complete(
      toastId,
      `${successes.length} reports ready`,
      successes.map((j) => j.subject).join(', '),
    )
  } else if (successes.length === 0) {
    toast.fail(
      toastId,
      `${failures.length} reports failed`,
      failures.map((j) => j.subject).join(', '),
    )
  } else {
    // Mixed outcome — lead with the failures since those need attention.
    toast.fail(
      toastId,
      `${successes.length} ready · ${failures.length} failed`,
      `Failed: ${failures.map((j) => j.subject).join(', ')}`,
    )
  }

  const settledVariant: ToastVariant = failures.length > 0 ? 'error' : 'success'
  const linger = settledVariant === 'error' ? ERROR_LINGER_MS : SUCCESS_LINGER_MS
  // Fully reset so the NEXT wave of reports starts a fresh toast rather than
  // reviving this settled one. Guard against a job registered during linger.
  clearSettleTimer()
  const releasingToast = toastId
  settleTimer = setTimeout(() => {
    settleTimer = null
    if (toastId === releasingToast && allSettled()) {
      jobs.clear()
      toastId = null
    }
  }, linger)
}

export interface GroupJobHandle {
  jobId: number
  /** The shared group toast id (same across every concurrent member). */
  sharedToastId: number
  setProgress: (progress: number, label: string) => void
  complete: (title: string, description?: string) => void
  fail: (title: string, description?: string) => void
}

/**
 * Register a report job with the shared group toast. Returns a handle the
 * progress driver uses to push stage/bar updates and a terminal outcome.
 */
export function joinReportGroup(subject: string, initialLabel: string): GroupJobHandle {
  clearSettleTimer()
  const jobId = ++jobCounter
  jobs.set(jobId, {
    id: jobId,
    subject,
    progress: 0.02,
    label: initialLabel,
    status: 'running',
  })
  ensureToast(subject, initialLabel)
  render()

  return {
    jobId,
    sharedToastId: toastId!,
    setProgress: (progress, label) => {
      const job = jobs.get(jobId)
      if (!job || job.status !== 'running') return
      job.progress = Math.max(0, Math.min(1, progress))
      job.label = label
      render()
    },
    complete: (title, description) => {
      const job = jobs.get(jobId)
      if (!job || job.status !== 'running') return
      job.status = 'success'
      job.progress = 1
      job.outcomeTitle = title
      job.outcomeDescription = description
      render()
    },
    fail: (title, description) => {
      const job = jobs.get(jobId)
      if (!job || job.status !== 'running') return
      job.status = 'error'
      job.progress = 1
      job.outcomeTitle = title
      job.outcomeDescription = description
      render()
    },
  }
}

/** Test-only reset of module-global group state. */
export function __resetReportGroupForTests(): void {
  clearSettleTimer()
  jobs.clear()
  toastId = null
  jobCounter = 0
}
