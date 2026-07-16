import { describe, expect, it } from 'vitest'
import { computeVelocity, formatVelocityPct } from './velocity'
import type { CountBucket } from './types'

function hourBuckets(counts: number[]): CountBucket[] {
  return counts.map((tweet_count, i) => ({
    start: `2026-07-15T${String(i).padStart(2, '0')}:00:00.000Z`,
    end: `2026-07-15T${String(i).padStart(2, '0')}:59:59.000Z`,
    tweet_count,
  }))
}

describe('computeVelocity', () => {
  it('returns nulls for empty buckets', () => {
    const v = computeVelocity([])
    expect(v.hourPct).toBeNull()
    expect(v.dayPct).toBeNull()
  })

  it('computes hour-over-hour percent', () => {
    const v = computeVelocity(hourBuckets([10, 20]))
    expect(v.lastHourCount).toBe(20)
    expect(v.priorHourCount).toBe(10)
    expect(v.hourPct).toBe(100)
  })

  it('handles zero prior hour with activity now', () => {
    const v = computeVelocity(hourBuckets([0, 5]))
    expect(v.hourPct).toBe(100)
  })

  it('sums last 24 vs prior 24 for dayPct', () => {
    const counts = [
      ...Array.from({ length: 24 }, () => 1),
      ...Array.from({ length: 24 }, () => 2),
    ]
    const v = computeVelocity(hourBuckets(counts))
    expect(v.lastDayCount).toBe(48)
    expect(v.priorDayCount).toBe(24)
    expect(v.dayPct).toBe(100)
  })
})

describe('formatVelocityPct', () => {
  it('formats signed percent', () => {
    expect(formatVelocityPct(12.4)).toBe('+12%')
    expect(formatVelocityPct(-5)).toBe('-5%')
    expect(formatVelocityPct(null)).toBe('—')
  })
})
