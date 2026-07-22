import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { blobFromVeniceUrl } from '../lib/media-blob'
import { MAX_CONCURRENT_MEDIA_JOBS } from '../lib/media-concurrency'
import { venice, veniceFetch, VeniceAPIError } from '../lib/venice-client'
import { recordMediaCost } from '../lib/venice/media-cost'
import { chargeAction, assertPaidReady, markActionStart } from '../lib/x402/charge-flow'
import { notifyInsufficientFunds } from '../lib/x402/notify-insufficient'
import { toast } from '../stores/toast-store'
import type { MusicQueueRequest, MusicQueueResponse, MusicRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 120

function isPermanentError(err: unknown): boolean {
  return err instanceof VeniceAPIError && err.status >= 400 && err.status < 500
}

export interface MusicJobMeta {
  prompt: string
  lyrics?: string
  model: string
  extras?: Record<string, string | number | boolean>
}

export type MusicJobStatus = 'queueing' | 'queued' | 'processing' | 'completed' | 'failed'

export interface MusicJob {
  id: string
  status: MusicJobStatus
  model: string
  queueId?: string
  error?: string
  suggestedPrompt?: string | null
  issues?: string[] | null
  elapsedMs: number
  blob?: Blob
  meta: MusicJobMeta
  startedAt: number
}

interface JobRuntime {
  poll?: ReturnType<typeof setInterval>
  tick?: ReturnType<typeof setInterval>
  cancelled: boolean
  attempts: number
}

function isActive(status: MusicJobStatus) {
  return status === 'queueing' || status === 'queued' || status === 'processing'
}

export function useMusic() {
  const [jobs, setJobs] = useState<MusicJob[]>([])
  const jobsRef = useRef<MusicJob[]>([])
  const runtimesRef = useRef<Map<string, JobRuntime>>(new Map())
  const queryClient = useQueryClient()

  /** Record the cost of a completed track once, priced by duration seconds. */
  const recordMusicCost = useCallback((job: MusicJob) => {
    const durationRaw = job.meta.extras?.duration_seconds ?? job.meta.extras?.duration
    const seconds =
      typeof durationRaw === 'number'
        ? durationRaw
        : typeof durationRaw === 'string' && /^\d+(\.\d+)?$/.test(durationRaw)
          ? parseFloat(durationRaw)
          : undefined
    const sinceTs = markActionStart()
    recordMediaCost(
      queryClient,
      'music',
      job.model,
      { seconds },
      { action: 'music', meta: { jobId: job.id } },
    )
    void chargeAction('music', { sinceTs }).then((charge) => {
      if (charge.insufficient) notifyInsufficientFunds(charge)
    })
  }, [queryClient])

  const syncJobs = useCallback((updater: (prev: MusicJob[]) => MusicJob[]) => {
    setJobs((prev) => {
      const next = updater(prev)
      jobsRef.current = next
      return next
    })
  }, [])

  const patchJob = useCallback((id: string, patch: Partial<MusicJob>) => {
    syncJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  }, [syncJobs])

  const stopJobTimers = useCallback((id: string) => {
    const rt = runtimesRef.current.get(id)
    if (!rt) return
    if (rt.poll) clearInterval(rt.poll)
    if (rt.tick) clearInterval(rt.tick)
    rt.poll = undefined
    rt.tick = undefined
  }, [])

  const removeRuntime = useCallback((id: string) => {
    stopJobTimers(id)
    runtimesRef.current.delete(id)
  }, [stopJobTimers])

  /** Toast via the global toaster, then drop the job (no inline error UI). */
  const failJob = useCallback((id: string, err: unknown) => {
    removeRuntime(id)
    toast.fromError(err, 'Music failed')
    syncJobs((prev) => prev.filter((j) => j.id !== id))
  }, [removeRuntime, syncJobs])

  useEffect(() => () => {
    for (const id of [...runtimesRef.current.keys()]) removeRuntime(id)
  }, [removeRuntime])

  const startPolling = useCallback((jobId: string) => {
    const rt = runtimesRef.current.get(jobId)
    if (!rt) return
    rt.attempts = 0
    rt.cancelled = false

    rt.tick = setInterval(() => {
      const job = jobsRef.current.find((j) => j.id === jobId)
      if (!job || !isActive(job.status)) return
      patchJob(jobId, { elapsedMs: Date.now() - job.startedAt })
    }, 1000)

    rt.poll = setInterval(async () => {
      const runtime = runtimesRef.current.get(jobId)
      if (!runtime || runtime.cancelled) return
      const job = jobsRef.current.find((j) => j.id === jobId)
      if (!job?.queueId) return

      runtime.attempts += 1
      if (runtime.attempts > MAX_ATTEMPTS) {
        failJob(jobId, new Error('Generation took too long. Cancel and try again.'))
        return
      }

      try {
        const res = await veniceFetch('/audio/retrieve', {
          method: 'POST',
          body: JSON.stringify({
            model: job.model,
            queue_id: job.queueId,
            delete_media_on_completion: true,
          }),
        })
        if (runtime.cancelled) return
        const contentType = res.headers.get('content-type') ?? ''

        if (contentType.startsWith('audio/')) {
          const blob = await res.blob()
          if (runtime.cancelled) return
          stopJobTimers(jobId)
          patchJob(jobId, { status: 'completed', blob, elapsedMs: Date.now() - job.startedAt })
          recordMusicCost(job)
          return
        }

        const result = (await res.json()) as MusicRetrieveResponse
        const s = result.status.toLowerCase() as 'queued' | 'processing' | 'completed' | 'failed'
        if (s === 'queued' || s === 'processing') {
          patchJob(jobId, { status: s })
          return
        }
        if (s === 'completed' && result.audio_url) {
          try {
            const blob = await blobFromVeniceUrl(result.audio_url)
            if (runtime.cancelled) return
            stopJobTimers(jobId)
            patchJob(jobId, {
              status: 'completed',
              blob: blob.type ? blob : new Blob([blob], { type: 'audio/mpeg' }),
              elapsedMs: Date.now() - job.startedAt,
            })
            recordMusicCost(job)
          } catch (fetchErr) {
            failJob(jobId, fetchErr instanceof Error ? fetchErr : new Error('Failed to download completed audio'))
          }
          return
        }
        if (s === 'failed') {
          failJob(jobId, new Error(result.error ?? 'Music generation failed'))
        }
      } catch (err) {
        if (isPermanentError(err)) {
          failJob(jobId, err)
          return
        }
        if (runtime.attempts >= MAX_ATTEMPTS) {
          failJob(jobId, err instanceof Error ? err : new Error('Polling failed'))
        }
      }
    }, POLL_INTERVAL_MS)
  }, [failJob, patchJob, stopJobTimers, recordMusicCost])

  const activeCount = jobs.filter((j) => isActive(j.status)).length
  const atCapacity = activeCount >= MAX_CONCURRENT_MEDIA_JOBS

  const queue = useCallback(async (req: MusicQueueRequest, meta: MusicJobMeta) => {
    assertPaidReady()
    if (jobsRef.current.filter((j) => isActive(j.status)).length >= MAX_CONCURRENT_MEDIA_JOBS) {
      throw new Error(`Already running ${MAX_CONCURRENT_MEDIA_JOBS} tracks. Wait for one to finish.`)
    }

    const id = crypto.randomUUID()
    const startedAt = Date.now()
    const job: MusicJob = {
      id,
      status: 'queueing',
      model: req.model,
      meta,
      startedAt,
      elapsedMs: 0,
    }
    runtimesRef.current.set(id, { cancelled: false, attempts: 0 })
    syncJobs((prev) => [job, ...prev])

    try {
      const data = await venice<MusicQueueResponse>('/audio/queue', {
        method: 'POST',
        body: JSON.stringify(req),
      })
      const rt = runtimesRef.current.get(id)
      if (!rt || rt.cancelled) return id

      patchJob(id, {
        status: 'queued',
        model: data.model,
        queueId: data.queue_id,
      })
      startPolling(id)
      return id
    } catch (err) {
      failJob(id, err instanceof Error ? err : new Error('Queue failed'))
      throw err
    }
  }, [failJob, patchJob, startPolling, syncJobs])

  const dismissJob = useCallback((id: string) => {
    removeRuntime(id)
    syncJobs((prev) => prev.filter((j) => j.id !== id))
  }, [removeRuntime, syncJobs])

  const cancelJob = useCallback((id: string) => {
    const rt = runtimesRef.current.get(id)
    if (rt) rt.cancelled = true
    removeRuntime(id)
    syncJobs((prev) => prev.filter((j) => j.id !== id))
  }, [removeRuntime, syncJobs])

  const cancelAll = useCallback(() => {
    const activeIds = jobsRef.current.filter((j) => isActive(j.status)).map((j) => j.id)
    for (const id of activeIds) {
      const rt = runtimesRef.current.get(id)
      if (rt) rt.cancelled = true
      removeRuntime(id)
    }
    syncJobs((prev) => prev.filter((j) => !isActive(j.status)))
  }, [removeRuntime, syncJobs])

  const takeCompleted = useCallback((id: string): MusicJob | null => {
    const job = jobsRef.current.find((j) => j.id === id && j.status === 'completed' && j.blob)
    if (!job) return null
    dismissJob(id)
    return job
  }, [dismissJob])

  return {
    queue,
    jobs,
    activeCount,
    atCapacity,
    maxConcurrent: MAX_CONCURRENT_MEDIA_JOBS,
    cancelJob,
    cancelAll,
    dismissJob,
    takeCompleted,
  }
}
