import { beforeEach, describe, expect, it } from 'vitest'
import { useMediaInflightStore } from './media-inflight-store'

describe('media-inflight-store', () => {
  beforeEach(() => {
    useMediaInflightStore.setState({ jobs: [] })
  })

  it('tracks slots across start/finish so placeholders survive remount', () => {
    const a = useMediaInflightStore.getState().start('image', 2, 'prompt a')
    const b = useMediaInflightStore.getState().start('image', 1, 'prompt b')
    expect(useMediaInflightStore.getState().pendingJobs('image')).toBe(2)
    expect(useMediaInflightStore.getState().pendingSlots('image')).toBe(3)
    useMediaInflightStore.getState().finish(a)
    expect(useMediaInflightStore.getState().pendingSlots('image')).toBe(1)
    useMediaInflightStore.getState().finish(b)
    expect(useMediaInflightStore.getState().pendingSlots('image')).toBe(0)
  })

  it('reuses an explicit id (video/music job id)', () => {
    const id = 'job-fixed'
    useMediaInflightStore.getState().start('video', 1, 'clip', id)
    useMediaInflightStore.getState().start('video', 1, 'clip', id)
    expect(useMediaInflightStore.getState().jobs).toHaveLength(1)
    expect(useMediaInflightStore.getState().jobs[0].id).toBe(id)
  })
})
