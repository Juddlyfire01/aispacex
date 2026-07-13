import { describe, it, expect } from 'vitest'
import {
  SPHERE_REPORT_STARTER,
  buildSphereReportPrompt,
} from './sphere-report-workflow'

describe('buildSphereReportPrompt', () => {
  it('covers the three-phase pattern', () => {
    const prompt = buildSphereReportPrompt()
    expect(prompt).toMatch(/Phase 1/i)
    expect(prompt).toMatch(/Phase 2/i)
    expect(prompt).toMatch(/Phase 3/i)
    expect(prompt).toMatch(/compose_write_draft/)
    expect(prompt).toMatch(/longform/i)
    expect(prompt).toMatch(/@handles|handles/)
    expect(prompt).toMatch(/\$cashtags|cashtags/i)
    expect(prompt).toMatch(/post ids|status/i)
  })

  it('defaults to informational register without metrics dump in draft', () => {
    const prompt = buildSphereReportPrompt({ informationalRegister: true })
    expect(prompt).toMatch(/NO Venice protocol metrics dump/i)
    expect(prompt).toMatch(/informational report/i)
  })

  it('allows metrics when informationalRegister is false', () => {
    const prompt = buildSphereReportPrompt({ informationalRegister: false })
    expect(prompt).toMatch(/dense stats/i)
    expect(prompt).not.toMatch(/NO Venice protocol metrics dump/)
  })
})

describe('SPHERE_REPORT_STARTER', () => {
  it('forces longform and builds a non-empty prompt', () => {
    expect(SPHERE_REPORT_STARTER.preferredFormat).toBe('longform')
    expect(SPHERE_REPORT_STARTER.label).toBeTruthy()
    expect(SPHERE_REPORT_STARTER.buildPrompt().length).toBeGreaterThan(200)
  })
})
