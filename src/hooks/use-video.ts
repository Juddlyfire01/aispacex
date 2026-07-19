import { useCallback, useEffect, useRef, useState } from 'react'
import { blobFromVeniceUrl } from '../lib/media-blob'
import { MAX_CONCURRENT_MEDIA_JOBS } from '../lib/media-concurrency'
import { venice, veniceFetch, VeniceAPIError } from '../lib/venice-client'
import { toast } from '../stores/toast-store'
import type { VideoQueueRequest, VideoQueueResponse, VideoRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 200

function isPermanentError(err: unknown): boolean {
  return err instanceof VeniceAPIError && err.status >= 400 && err.status < 500
}

export interface VideoJobMeta {
  prompt: string
  negativePrompt?: string
  model: string
  extras?: Record<string, string | number | boolean>
}

export type VideoJobStatus = 'queueing' | 'queued' | 'processing' | 'completed' | 'failed'

export interface VideoJob {
  id: string
  status: VideoJobStatus
  model: string
  queueId?: string
  downloadUrl?: string
  error?: string
  suggestedPrompt?: string | null
  issues?: string[] | null
  elapsedMs: number
  blob?: Blob
  meta: VideoJobMeta
  startedAt: number
}

interface JobRuntime {
  poll?: ReturnType<typeof setInterval>
  tick?: ReturnType<typeof setInterval>
  cancelled: boolean
  attempts: number
}

function isActive(status: VideoJobStatus) {
  return status === 'queueing' || status === 'queued' || status === 'processing'
}

/** Finalize a completed job: tells Venice to delete the now-downloaded media.
 * Best-effort — media is already in hand, so a failure here is harmless. */
async function finalize(job: VideoJob) {
  if (!job.queueId) return
  try {
    await veniceFetch('/video/complete', {
      method: 'POST',
      body: JSON.stringify({ model: job.model, queue_id: job.queueId }),
    })
  } catch {
    /* media already downloaded; deletion is best-effort */
  }
}

export function useVideo() {
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const jobsRef = useRef<VideoJob[]>([])
  const runtimesRef = useRef<Map<string, JobRuntime>>(new Map())

  const syncJobs = useCallback((updater: (prev: VideoJob[]) => VideoJob[]) => {
    setJobs((prev) => {
      const next = updater(prev)
      jobsRef.current = next
      return next
    })
  }, [])

  const patchJob = useCallback((id: string, patch: Partial<VideoJob>) => {
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
    toast.fromError(err, 'Video failed')
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
        failJob(jobId, new Error('Generation took too long. Cancel and try again, or check your Venice dashboard.'))
        return
      }

      try {
        const res = await veniceFetch('/video/retrieve', {
          method: 'POST',
          body: JSON.stringify({
            model: job.model,
            queue_id: job.queueId,
            // Do NOT delete on completion: a completed VPS job still needs its
            // media downloaded. We finalize (delete) via /video/complete only
            // after a successful download, so a failed download can be retried.
          }),
        })
        if (runtime.cancelled) return
        const contentType = res.headers.get('content-type') ?? ''

        if (contentType.startsWith('video/')) {
          const blob = await res.blob()
          if (runtime.cancelled) return
          stopJobTimers(jobId)
          patchJob(jobId, { status: 'completed', blob, elapsedMs: Date.now() - job.startedAt })
          void finalize(job)
          return
        }

        const result = (await res.json()) as VideoRetrieveResponse
        const s = result.status?.toLowerCase() as VideoRetrieveResponse['status'] | undefined
        if (s === 'queued' || s === 'processing') {
          patchJob(jobId, { status: s })
          return
        }

        if (s === 'completed') {
          const url = result.video_url || job.downloadUrl
          if (!url) {
            failJob(jobId, new Error('Generation completed but no video URL was returned.'))
            return
          }
          try {
            const blob = await blobFromVeniceUrl(url)
            if (runtime.cancelled) return
            stopJobTimers(jobId)
            patchJob(jobId, {
              status: 'completed',
              blob: blob.type ? blob : new Blob([blob], { type: 'video/mp4' }),
              elapsedMs: Date.now() - job.startedAt,
            })
            void finalize(job)
          } catch (fetchErr) {
            failJob(jobId, fetchErr instanceof Error ? fetchErr : new Error('Failed to download completed video'))
          }
          return
        }

        if (s === 'failed') {
          failJob(jobId, new Error(result.error ?? 'Video generation failed'))
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
  }, [failJob, patchJob, stopJobTimers])

  const activeCount = jobs.filter((j) => isActive(j.status)).length
  const atCapacity = activeCount >= MAX_CONCURRENT_MEDIA_JOBS

  const queue = useCallback(async (req: VideoQueueRequest, meta: VideoJobMeta) => {
    if (jobsRef.current.filter((j) => isActive(j.status)).length >= MAX_CONCURRENT_MEDIA_JOBS) {
      throw new Error(`Already running ${MAX_CONCURRENT_MEDIA_JOBS} videos. Wait for one to finish.`)
    }

    const id = crypto.randomUUID()
    const startedAt = Date.now()
    const job: VideoJob = {
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
      const data = await venice<VideoQueueResponse>('/video/queue', {
        method: 'POST',
        body: JSON.stringify(req),
      })
      const rt = runtimesRef.current.get(id)
      if (!rt || rt.cancelled) return id

      patchJob(id, {
        status: 'queued',
        model: data.model,
        queueId: data.queue_id || data.id || '',
        downloadUrl: data.download_url ?? undefined,
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

  /** Remove completed job after its blob has been persisted to the gallery. */
  const takeCompleted = useCallback((id: string): VideoJob | null => {
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
