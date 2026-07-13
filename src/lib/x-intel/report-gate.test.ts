import { describe, expect, it } from 'vitest'
import { canGenerateAfterRefresh } from './report-gate'

describe('canGenerateAfterRefresh', () => {
  it('allows the first report when history is empty', () => {
    expect(canGenerateAfterRefresh(null, undefined)).toBe(true)
    expect(canGenerateAfterRefresh(undefined, '2026-07-13T10:00:00.000Z')).toBe(true)
  })

  it('blocks a second generate until profile is refreshed after the report', () => {
    const reportAt = '2026-07-13T12:00:00.000Z'
    expect(canGenerateAfterRefresh(reportAt, '2026-07-13T11:00:00.000Z')).toBe(false)
    expect(canGenerateAfterRefresh(reportAt, reportAt)).toBe(false)
    expect(canGenerateAfterRefresh(reportAt, undefined)).toBe(false)
  })

  it('allows generate when profile refresh is newer than the last report', () => {
    expect(
      canGenerateAfterRefresh('2026-07-13T12:00:00.000Z', '2026-07-13T12:05:00.000Z'),
    ).toBe(true)
  })
})
