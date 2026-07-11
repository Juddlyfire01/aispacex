import { describe, it, expect } from 'vitest'
import { growIncludedReportIdsIfMax, isReportContextAtMax } from './report-context'

describe('isReportContextAtMax', () => {
  it('is true for empty history (vacuous max)', () => {
    expect(isReportContextAtMax([], [])).toBe(true)
    expect(isReportContextAtMax(['x'], [])).toBe(true)
  })

  it('is true when every history id is selected', () => {
    expect(isReportContextAtMax(['a', 'b'], [{ id: 'a' }, { id: 'b' }])).toBe(true)
  })

  it('is false for None or partial selection', () => {
    expect(isReportContextAtMax([], [{ id: 'a' }])).toBe(false)
    expect(isReportContextAtMax(['a'], [{ id: 'a' }, { id: 'b' }])).toBe(false)
  })
})

describe('growIncludedReportIdsIfMax', () => {
  it('seeds the first report when history was empty', () => {
    expect(growIncludedReportIdsIfMax([], [], 'a')).toEqual(['a'])
  })

  it('appends +1 when prior selection was MAX', () => {
    expect(
      growIncludedReportIdsIfMax(['a', 'b'], [{ id: 'a' }, { id: 'b' }], 'c'),
    ).toEqual(['c', 'a', 'b'])
  })

  it('leaves None and custom selections alone', () => {
    expect(growIncludedReportIdsIfMax([], [{ id: 'a' }], 'b')).toEqual([])
    expect(
      growIncludedReportIdsIfMax(['a'], [{ id: 'a' }, { id: 'b' }], 'c'),
    ).toEqual(['a'])
  })
})
