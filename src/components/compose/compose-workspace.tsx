import { useEffect, useMemo, useState } from 'react'
import { useComposeStore, ME_CONTEXT, ALL_CONTEXT, type XSearchMode } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { useModels } from '../../hooks/use-models'
import { pickComposeModel, modelSupportsXSearch } from '../../lib/compose/model'
import { computeHotBudget, resolveContextLimit } from '../../lib/compose/token-estimate'
import { packHotWindow } from '../../lib/compose/hot-window'
import { buildIntelSnapshot } from '../../lib/intel-library/from-stores'
import { contextKeyFromScope } from '../../lib/intel-library/scope'
import type { ComposeScope } from '../../lib/intel-library/types'
import { libraryCounts } from '../../lib/intel-library/library'
import { ComposeChat } from './compose-chat'
import { PostComposer } from './post-composer'
import { ComposeActions } from './compose-actions'
import { LibraryMeter } from './library-meter'

const X_SEARCH_MODES: XSearchMode[] = ['off', 'auto', 'on']

function scopeFromSelectValue(value: string): ComposeScope {
  if (value === ME_CONTEXT) return { type: 'me' }
  if (value === ALL_CONTEXT) return { type: 'all' }
  return { type: 'target', username: value }
}

export function ComposeWorkspace() {
  const { data: models } = useModels('text')
  const activeThreadId = useComposeStore((s) => s.activeThreadId)
  const threads = useComposeStore((s) => s.threads)
  const ensureActiveThread = useComposeStore((s) => s.ensureActiveThread)
  const createThread = useComposeStore((s) => s.createThread)
  const setNewThreadContext = useComposeStore((s) => s.setNewThreadContext)
  const newThreadContext = useComposeStore((s) => s.newThreadContext)
  const model = useComposeStore((s) => s.model)
  const setModel = useComposeStore((s) => s.setModel)
  const setContextLimit = useComposeStore((s) => s.setContextLimit)
  const contextLimit = useComposeStore((s) => s.contextLimit)
  const xSearch = useComposeStore((s) => s.xSearch)
  const setXSearch = useComposeStore((s) => s.setXSearch)
  const libraryMode = useComposeStore((s) => s.libraryMode)
  const setLibraryMode = useComposeStore((s) => s.setLibraryMode)
  const budgetPct = useComposeStore((s) => s.budgetPct)
  const setBudgetPct = useComposeStore((s) => s.setBudgetPct)
  const dayWindowDays = useComposeStore((s) => s.dayWindowDays)
  const setDayWindowDays = useComposeStore((s) => s.setDayWindowDays)

  const targets = useXIntelStore((s) => s.targets)
  const reports = useXIntelStore((s) => s.reports)
  const selfAccounts = useXSelfStore((s) => s.accounts)

  const [copied, setCopied] = useState(false)

  // Resolve default once the list loads: highest Grok w/ X search, then fallbacks.
  useEffect(() => {
    if (model || !models || models.length === 0) return
    setModel(pickComposeModel(models))
  }, [model, models, setModel])

  // Keep contextLimit in sync with the selected model for hot-window budgeting.
  useEffect(() => {
    const modelObj = models?.find((m) => m.id === model)
    setContextLimit(resolveContextLimit(modelObj))
  }, [model, models, setContextLimit])

  useEffect(() => {
    ensureActiveThread()
  }, [ensureActiveThread])

  const threadId = activeThreadId && threads[activeThreadId] ? activeThreadId : null
  const activeThread = threadId ? threads[threadId] : undefined

  const modelObj = useMemo(() => models?.find((m) => m.id === model), [models, model])
  const limitAssumed = !(
    typeof modelObj?.model_spec?.availableContextTokens === 'number' &&
    modelObj.model_spec.availableContextTokens > 0
  )

  const snapshot = useMemo(
    () =>
      buildIntelSnapshot({
        selfAccounts: Object.values(selfAccounts),
        reports: Object.values(reports),
      }),
    [selfAccounts, reports],
  )

  // Scope for meter: active thread context, else new-thread default.
  const scope = activeThread?.context ?? newThreadContext
  const contextSelectValue = contextKeyFromScope(scope)

  const budget = useMemo(
    () => computeHotBudget(contextLimit, budgetPct),
    [contextLimit, budgetPct],
  )

  const pack = useMemo(
    () =>
      packHotWindow({
        snapshot,
        scope,
        mode: libraryMode,
        dayWindowDays,
        tokenBudget: budget,
        now: new Date(),
      }),
    [snapshot, scope, libraryMode, dayWindowDays, budget],
  )

  const counts = useMemo(() => libraryCounts(snapshot, scope), [snapshot, scope])

  const sendBlocked = libraryMode === 'custom' && pack.overBudget
  const xSearchSupported = models ? modelSupportsXSearch(models, model) : false

  const onContextChange = (value: string) => {
    const next = scopeFromSelectValue(value)
    setNewThreadContext(next)
    // Temporary until thread UI (Task 5–7): switching context starts a new thread.
    createThread(next)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-b border-white/[0.05]">
        <label className="flex items-center gap-1.5 text-[11px] text-white/40">
          Context
          <select
            value={contextSelectValue}
            onChange={(e) => onContextChange(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1 text-[11px] text-white/70 outline-none"
          >
            <option value={ME_CONTEXT}>Your account</option>
            <option value={ALL_CONTEXT}>All (entire data set)</option>
            {targets.map((t) => (
              <option key={t} value={t}>
                @{t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-white/40">
          Model
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1 text-[11px] text-white/70 outline-none max-w-[220px]"
          >
            {(models ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {(m.model_spec?.name || m.id) +
                  (m.model_spec?.capabilities?.supportsXSearch ? ' · X search' : '')}
              </option>
            ))}
            {model && !models?.some((m) => m.id === model) && <option value={model}>{model}</option>}
          </select>
        </label>

        <div className="flex items-center gap-1.5 text-[11px] text-white/40">
          X search
          <div className="flex rounded-md overflow-hidden border border-[var(--color-border-faint)]">
            {X_SEARCH_MODES.map((mode) => (
              <button
                key={mode}
                onClick={() => setXSearch(mode)}
                className={`px-2 py-1 text-[10px] transition-colors ${
                  xSearch === mode ? 'bg-white text-black' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          {!xSearchSupported && xSearch !== 'off' && (
            <span className="text-[10px] text-amber-400/60">model lacks X search</span>
          )}
        </div>

        <div className="w-full sm:w-auto sm:flex-1 min-w-[240px]">
          <LibraryMeter
            pack={pack}
            budget={budget}
            contextLimit={contextLimit}
            budgetPct={budgetPct}
            libraryMode={libraryMode}
            dayWindowDays={dayWindowDays}
            counts={counts}
            limitAssumed={limitAssumed}
            onModeChange={setLibraryMode}
            onBudgetPctChange={setBudgetPct}
            onDayWindowChange={setDayWindowDays}
          />
        </div>
      </div>

      {/* Split view */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 border-r border-white/[0.05]">
          {threadId ? (
            <ComposeChat threadId={threadId} sendBlocked={sendBlocked} />
          ) : null}
        </div>
        <div className="w-[46%] max-w-[560px] min-w-0 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            {threadId ? <PostComposer threadId={threadId} /> : null}
          </div>
          {threadId ? (
            <ComposeActions threadId={threadId} copied={copied} setCopied={setCopied} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
