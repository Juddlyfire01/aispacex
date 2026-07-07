import { describe, it, expect } from 'vitest'
import { computeFloatingRect } from './floating-panel'

const viewport = { width: 1200, height: 800 }

describe('computeFloatingRect', () => {
  it('places the panel below the anchor by default', () => {
    const anchor = { top: 100, bottom: 124, left: 40, right: 64, width: 24, height: 24, x: 40, y: 100, toJSON: () => ({}) }
    const pos = computeFloatingRect(anchor as DOMRect, 352, 300, 6, 8, viewport)
    expect(pos.top).toBe(130)
    expect(pos.left).toBe(40)
  })

  it('flips above when there is not enough space below', () => {
    const anchor = { top: 700, bottom: 724, left: 40, right: 64, width: 24, height: 24, x: 40, y: 700, toJSON: () => ({}) }
    const pos = computeFloatingRect(anchor as DOMRect, 352, 300, 6, 8, viewport)
    expect(pos.top).toBe(394)
  })

  it('aligns to the right edge when the panel would overflow horizontally', () => {
    const anchor = { top: 100, bottom: 124, left: 900, right: 924, width: 24, height: 24, x: 900, y: 100, toJSON: () => ({}) }
    const pos = computeFloatingRect(anchor as DOMRect, 352, 300, 6, 8, { width: 1000, height: 900 })
    expect(pos.left).toBe(572)
  })
})
