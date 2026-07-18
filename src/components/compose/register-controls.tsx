import { useEffect, useMemo, useRef, useState } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useXIntelStore, findReportKey } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import type { DraftRegister, RegisterMode, RegisterPack } from '../../lib/compose/register'
import {
  emptyRegisterPack,
  isRegisterPackEmpty,
  packFromReportRegister,
  parseRegisterUpload,
} from '../../lib/compose/register'

const MODES: { value: RegisterMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'you', label: 'You' },
  { value: 'other', label: 'Other' },
  { value: 'custom', label: 'Custom prompt' },
  { value: 'upload', label: 'Upload JSON' },
]

const REGISTER_HINT =
  'Style sheet — cadence, diction, stance, rhetoric, texture, constraints. Default is your own; pick another target or a custom pack to override. Applies on the next chat turn. No sample posts (avoids repetition).'

function activeSnapshot<T extends { id: string }>(
  reportHistory: T[],
  activeReportId: string | null,
): T | null {
  return reportHistory.find((r) => r.id === activeReportId) ?? reportHistory[0] ?? null
}

function packEditorValue(pack: RegisterPack): string {
  return JSON.stringify(pack, null, 2)
}

interface RegisterControlsProps {
  threadId: string
}

export function RegisterControls({ threadId }: RegisterControlsProps) {
  const thread = useComposeStore((s) => s.threads[threadId])
  const applyDraftPatch = useComposeStore((s) => s.applyDraftPatch)
  const registerDefault = useComposeStore((s) => s.registerDefault)
  const setRegisterDefault = useComposeStore((s) => s.setRegisterDefault)
  const fileRef = useRef<HTMLInputElement>(null)
  const [packText, setPackText] = useState('')
  const [packError, setPackError] = useState<string | null>(null)
  const [packExpanded, setPackExpanded] = useState(false)

  const targets = useXIntelStore((s) => s.targets)
  const reports = useXIntelStore((s) => s.reports)
  const patchTargetRegister = useXIntelStore((s) => s.patchActiveReportRegister)

  const activeAccountId = useXSelfStore((s) => s.activeAccountId)
  const accountOrder = useXSelfStore((s) => s.accountOrder)
  const accounts = useXSelfStore((s) => s.accounts)
  const patchSelfRegister = useXSelfStore((s) => s.patchActiveReportRegister)

  const selfId = activeAccountId ?? accountOrder[0] ?? null
  const selfAccount = selfId ? accounts[selfId] : null

  const youLive = useMemo(() => {
    if (!selfAccount) return null
    const snap = activeSnapshot(selfAccount.reportHistory, selfAccount.activeReportId)
    if (!snap?.narrative?.register) return null
    const pack = packFromReportRegister(snap.narrative.register)
    return isRegisterPackEmpty(pack) ? null : pack
  }, [selfAccount])

  const draftReg: DraftRegister = thread?.draft.register ?? { mode: 'you' }
  const otherUsername = draftReg.otherUsername?.replace(/^@/, '') ?? ''

  const otherLive = useMemo(() => {
    if (!otherUsername) return null
    const key = findReportKey(reports, otherUsername)
    if (!key) return null
    const report = reports[key]
    const snap = activeSnapshot(report.reportHistory, report.activeReportId)
    if (!snap?.narrative?.register) return null
    const pack = packFromReportRegister(snap.narrative.register)
    return isRegisterPackEmpty(pack) ? null : pack
  }, [otherUsername, reports])

  const targetsWithReport = useMemo(() => {
    return targets.filter((u) => {
      const key = findReportKey(reports, u)
      if (!key) return false
      const report = reports[key]
      const snap = activeSnapshot(report.reportHistory, report.activeReportId)
      if (!snap?.narrative?.register) return false
      return !isRegisterPackEmpty(packFromReportRegister(snap.narrative.register))
    })
  }, [targets, reports])

  const patchRegister = (next: DraftRegister) => {
    applyDraftPatch(threadId, { register: next })
  }

  const modeUnavailable =
    (draftReg.mode === 'you' && !youLive && !draftReg.localPack) ||
    (draftReg.mode === 'other' && !otherLive && !draftReg.localPack)

  const displayedPack: RegisterPack | null =
    draftReg.mode === 'none'
      ? null
      : draftReg.mode === 'custom'
        ? draftReg.localPack ?? emptyRegisterPack()
        : draftReg.mode === 'upload'
          ? draftReg.localPack ?? null
          : draftReg.localPack ?? (draftReg.mode === 'you' ? youLive : otherLive)

  useEffect(() => {
    if (!displayedPack) {
      setPackText('')
      setPackError(null)
      return
    }
    // Only reset editor when switching mode/target or live report changes —
    // not on every successful local parse (avoids cursor jumps).
    setPackText(packEditorValue(displayedPack))
    setPackError(null)
  }, [draftReg.mode, draftReg.otherUsername, youLive, otherLive]) // eslint-disable-line react-hooks/exhaustive-deps -- intentional narrow sync

  // Guard AFTER all hooks so the hook count never changes between renders (a
  // conditional hook throws "Rendered more hooks than during the previous
  // render" and tears down the tree).
  if (!thread) return null

  const showPackEditor =
    draftReg.mode === 'you' ||
    draftReg.mode === 'other' ||
    draftReg.mode === 'custom' ||
    draftReg.mode === 'upload'

  const canSaveToReport =
    (draftReg.mode === 'you' || draftReg.mode === 'other') &&
    Boolean(draftReg.localPack) &&
    !isRegisterPackEmpty(draftReg.localPack)

  const isDefault =
    registerDefault.mode === draftReg.mode &&
    (draftReg.mode !== 'other' ||
      (registerDefault.otherUsername?.replace(/^@/, '') ?? '') === otherUsername)

  const onModeChange = (mode: RegisterMode) => {
    if (mode === 'you' && !youLive) {
      patchRegister({ mode: 'you', localPack: undefined, customPrompt: undefined })
      return
    }
    if (mode === 'other') {
      const first = targetsWithReport[0]
      patchRegister({
        mode: 'other',
        otherUsername: otherUsername || first,
        localPack: undefined,
        customPrompt: undefined,
      })
      return
    }
    if (mode === 'custom') {
      patchRegister({
        mode: 'custom',
        customPrompt: draftReg.customPrompt ?? '',
        localPack: draftReg.localPack ?? emptyRegisterPack(),
      })
      return
    }
    if (mode === 'upload') {
      patchRegister({ mode: 'upload', localPack: draftReg.localPack ?? null })
      return
    }
    patchRegister({ mode, localPack: undefined, customPrompt: undefined, otherUsername: undefined })
  }

  const onPackTextChange = (text: string) => {
    setPackText(text)
    try {
      const pack = parseRegisterUpload(text)
      setPackError(null)
      patchRegister({ ...draftReg, localPack: pack })
    } catch (err) {
      setPackError(err instanceof Error ? err.message : 'Invalid pack JSON')
    }
  }

  const onSaveToReport = () => {
    const pack = draftReg.localPack
    if (!pack || isRegisterPackEmpty(pack)) return
    const register = {
      summary: pack.summary,
      sections: pack.sections,
      devices: pack.devices,
    }
    if (draftReg.mode === 'you' && selfId) {
      patchSelfRegister(selfId, register)
      patchRegister({ ...draftReg, localPack: undefined })
      return
    }
    if (draftReg.mode === 'other' && otherUsername) {
      patchTargetRegister(otherUsername, register)
      patchRegister({ ...draftReg, localPack: undefined })
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor="compose-register-mode"
          className="text-[11px] text-[var(--color-text-tertiary)]"
          title={REGISTER_HINT}
        >
          Register
        </label>
        <span
          className="text-[10px] text-[var(--color-text-quaternary)] cursor-help"
          title={REGISTER_HINT}
          aria-label={REGISTER_HINT}
        >
          ?
        </span>
      </div>
      <select
        id="compose-register-mode"
        value={draftReg.mode}
        onChange={(e) => onModeChange(e.target.value as RegisterMode)}
        className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-secondary)] outline-none"
        title={REGISTER_HINT}
      >
        {MODES.map((m) => {
          const disabled =
            (m.value === 'you' && !youLive) ||
            (m.value === 'other' && targetsWithReport.length === 0)
          return (
            <option key={m.value} value={m.value} disabled={disabled}>
              {m.label}
              {m.value === 'you' && !youLive ? ' (generate report first)' : ''}
              {m.value === 'other' && targetsWithReport.length === 0 ? ' (no target reports)' : ''}
            </option>
          )
        })}
      </select>

      {draftReg.mode === 'other' && (
        <label className="block text-[11px] text-[var(--color-text-tertiary)]">
          Target
          <select
            value={otherUsername}
            onChange={(e) =>
              patchRegister({
                ...draftReg,
                otherUsername: e.target.value,
                localPack: undefined,
              })
            }
            className="w-full mt-1 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-secondary)] outline-none"
          >
            {targetsWithReport.length === 0 && <option value="">No reports available</option>}
            {targetsWithReport.map((u) => (
              <option key={u} value={u}>
                @{u.replace(/^@/, '')}
              </option>
            ))}
          </select>
        </label>
      )}

      {draftReg.mode === 'upload' && (
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const text = await file.text()
                const pack = parseRegisterUpload(text)
                patchRegister({ ...draftReg, mode: 'upload', localPack: pack })
              } catch (err) {
                console.error(err)
              }
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Choose JSON file
          </button>
        </div>
      )}

      {draftReg.mode === 'custom' && (
        <label className="block text-[11px] text-[var(--color-text-tertiary)]">
          Custom instructions
          <textarea
            value={draftReg.customPrompt ?? ''}
            onChange={(e) => patchRegister({ ...draftReg, customPrompt: e.target.value })}
            rows={3}
            placeholder="e.g. terse metric-dense replies, always flag risk, NFA close"
            className="w-full mt-1 bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-secondary)] outline-none resize-y min-h-[64px]"
          />
        </label>
      )}

      {showPackEditor && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setPackExpanded((v) => !v)}
            aria-expanded={packExpanded}
            className="flex w-full items-center justify-between gap-2 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <span>Register pack</span>
            <span className="font-mono text-[10px] text-[var(--color-text-quaternary)]">{packExpanded ? '−' : '+'}</span>
          </button>
          {modeUnavailable && !displayedPack && (
            <span className="block text-[10px] text-amber-400/80">
              Generate a report first to enable this register.
            </span>
          )}
          {packExpanded && displayedPack && (
            <>
              <textarea
                value={packText}
                onChange={(e) => onPackTextChange(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[10px] font-mono text-[var(--color-text-secondary)] outline-none resize-y min-h-[120px]"
              />
              {packError && (
                <span className="block text-[10px] text-amber-400/80">{packError}</span>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!isDefault && draftReg.mode !== 'custom' && draftReg.mode !== 'upload' && (
          <button
            type="button"
            onClick={() =>
              setRegisterDefault({
                mode: draftReg.mode,
                otherUsername: draftReg.mode === 'other' ? otherUsername : undefined,
              })
            }
            className="text-[10px] text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Make default
          </button>
        )}
        {canSaveToReport && (
          <button
            type="button"
            onClick={onSaveToReport}
            className="text-[10px] text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Save to report
          </button>
        )}
      </div>
    </div>
  )
}
