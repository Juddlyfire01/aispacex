import { create } from 'zustand'
import type { MediaKind } from '../lib/media-gallery'
import { MAX_CONCURRENT_MEDIA_JOBS } from '../lib/media-concurrency'

export interface MediaInflightJob {
  id: string
  kind: MediaKind
  /** Skeleton slots to show (e.g. image variants). */
  slots: number
  startedAt: number
  prompt?: string
}

interface MediaInflightState {
  jobs: MediaInflightJob[]
  /** Register an in-flight generation. Returns job id for finish/cancel. */
  start: (kind: MediaKind, slots?: number, prompt?: string, id?: string) => string
  /** Mark a job finished (success or error). */
  finish: (id: string) => void
  /** Drop all jobs of a kind (rare). */
  clearKind: (kind: MediaKind) => void
  pendingSlots: (kind: MediaKind) => number
  pendingJobs: (kind: MediaKind) => number
  atCapacity: (kind: MediaKind) => boolean
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `inflight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
}

/**
 * Session-scoped in-flight media generations. Survives view unmount so gallery
 * skeleton placeholders stay visible when the user navigates away mid-run.
 */
export const useMediaInflightStore = create<MediaInflightState>((set, get) => ({
  jobs: [],

  start: (kind, slots = 1, prompt, id) => {
    const jobId = id ?? newId()
    const job: MediaInflightJob = {
      id: jobId,
      kind,
      slots: Math.max(1, Math.floor(slots) || 1),
      startedAt: Date.now(),
      prompt,
    }
    set((s) => ({
      jobs: [job, ...s.jobs.filter((j) => j.id !== jobId)],
    }))
    return jobId
  },

  finish: (id) => {
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }))
  },

  clearKind: (kind) => {
    set((s) => ({ jobs: s.jobs.filter((j) => j.kind !== kind) }))
  },

  pendingSlots: (kind) =>
    get().jobs.filter((j) => j.kind === kind).reduce((n, j) => n + j.slots, 0),

  pendingJobs: (kind) => get().jobs.filter((j) => j.kind === kind).length,

  atCapacity: (kind) => get().pendingJobs(kind) >= MAX_CONCURRENT_MEDIA_JOBS,
}))

/** Imperative helpers for hooks outside React. */
export function startMediaInflight(
  kind: MediaKind,
  slots?: number,
  prompt?: string,
  id?: string,
): string {
  return useMediaInflightStore.getState().start(kind, slots, prompt, id)
}

export function finishMediaInflight(id: string): void {
  useMediaInflightStore.getState().finish(id)
}
