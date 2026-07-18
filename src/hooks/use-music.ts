import { useCallback, useEffect, useRef, useState } from 'react'
import { blobFromVeniceUrl } from '../lib/media-blob'
import { MAX_CONCURRENT_MEDIA_JOBS } from '../lib/media-concurrency'
import { venice, veniceFetch, VeniceAPIError } from '../lib/venice-client'
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
        stopJobTimers(jobId)
        patchJob(jobId, { status: 'failed', error: 'Generation took too long. Cancel and try again.' })
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
          } catch (fetchErr) {
            stopJobTimers(jobId)
            patchJob(jobId, {
              status: 'failed',
              error: fetchErr instanceof Error ? fetchErr.message : 'Failed to download completed audio',
            })
          }
          return
        }
        if (s === 'failed') {
          stopJobTimers(jobId)
          patchJob(jobId, { status: 'failed', error: result.error ?? 'Music generation failed' })
        }
      } catch (err) {
        if (isPermanentError(err)) {
          stopJobTimers(jobId)
          patchJob(jobId, {
            status: 'failed',
            error: err instanceof Error ? err.message : 'Polling failed',
          })
          return
        }
        if (runtime.attempts >= MAX_ATTEMPTS) {
          stopJobTimers(jobId)
          patchJob(jobId, {
            status: 'failed',
            error: err instanceof Error ? err.message : 'Polling failed',
          })
        }
      }
    }, POLL_INTERVAL_MS)
  }, [patchJob, stopJobTimers])

  const activeCount = jobs.filter((j) => isActive(j.status)).length
  const atCapacity = activeCount >= MAX_CONCURRENT_MEDIA_JOBS

  const queue = useCallback(async (req: MusicQueueRequest, meta: MusicJobMeta) => {
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
      removeRuntime(id)
      patchJob(id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Queue failed',
        suggestedPrompt: err instanceof VeniceAPIError ? err.suggestedPrompt ?? null : null,
        issues: err instanceof VeniceAPIError ? err.issues ?? null : null,
      })
      throw err
    }
  }, [patchJob, removeRuntime, startPolling, syncJobs])

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

  const latestError = jobs.find((j) => j.status === 'failed')

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
    error: latestError?.error ?? null,
    suggestedPrompt: latestError?.suggestedPrompt ?? null,
    issues: latestError?.issues ?? null,
  }
}
