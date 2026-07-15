import { describe, it, expect } from 'vitest'
import {
  SPHERE_REPORT_STARTER,
  SPHERE_SECTION_CENTER,
  SPHERE_SECTION_CLUSTERS,
  SPHERE_SECTION_ORBIT,
  buildSphereReportDisplayMessage,
  buildSphereReportPrompt,
} from './sphere-report-workflow'

describe('buildSphereReportPrompt', () => {
  it('covers the three-phase pattern and anti-early-exit rules', () => {
    const prompt = buildSphereReportPrompt()
    expect(prompt).toMatch(/Phase 1/i)
    expect(prompt).toMatch(/Phase 2/i)
    expect(prompt).toMatch(/Phase 3/i)
    expect(prompt).toMatch(/compose_write_draft/)
    expect(prompt).toMatch(/longform/i)
    expect(prompt).toMatch(/do not exit early/i)
    expect(prompt).toMatch(/FULL Phase 1 and FULL Phase 2/i)
    expect(prompt).toMatch(/IN CHAT/i)
    expect(prompt).toMatch(/@handles|handles/)
    expect(prompt).toMatch(/\$cashtags|cashtags/i)
    expect(prompt).toMatch(/post ids|status/i)
  })

  it('requires Sphere vernacular section headings', () => {
    const prompt = buildSphereReportPrompt()
    expect(prompt).toContain(SPHERE_SECTION_CENTER)
    expect(prompt).toContain(SPHERE_SECTION_CLUSTERS)
    expect(prompt).toContain(SPHERE_SECTION_ORBIT)
    expect(prompt).toMatch(/exact section headings/i)
  })

  it('adds a Phase 4 conclusion after the draft', () => {
    const prompt = buildSphereReportPrompt()
    expect(prompt).toMatch(/Phase 4/i)
    expect(prompt).toMatch(/Conclusion/i)
    expect(prompt).toMatch(/after the draft/i)
    // Conclusion is a sign-off, not another full report.
    expect(prompt).toMatch(/NOT another full report|not a re-run/i)
  })

  it('enforces the novelty / prior-art gate', () => {
    const prompt = buildSphereReportPrompt()
    expect(prompt).toMatch(/Phase 0/i)
    expect(prompt).toMatch(/prior art/i)
    expect(prompt).toMatch(/FORBIDDEN REUSE/i)
    expect(prompt).toMatch(/REQUIRED DELTA/i)
    expect(prompt).toMatch(/NOVELTY HARD RULE/i)
    expect(prompt).toMatch(/too similar/i)
    expect(prompt).toMatch(/FAILED run/i)
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

  it('display message is a short launch line, not the full prompt', () => {
    const display = buildSphereReportDisplayMessage()
    const prompt = SPHERE_REPORT_STARTER.buildPrompt()
    expect(display).toBe('Generate the Sphere Report')
    expect(display.length).toBeLessThan(prompt.length / 2)
    expect(display).not.toMatch(/compose_write_draft/)
    expect(display).not.toMatch(/CRITICAL/)
  })
})

describe('sphere section constants', () => {
  it('uses the correct vernacular labels', () => {
    expect(SPHERE_SECTION_CENTER).toBe('Central')
    expect(SPHERE_SECTION_CLUSTERS).toBe('Clusters')
    expect(SPHERE_SECTION_ORBIT).toBe('Related')
  })
})
