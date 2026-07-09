import { useEffect, useMemo } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { useModels } from '../../hooks/use-models'
import { pickComposeModel } from '../../lib/compose/model'
import { computeHotBudget, resolveContextLimit } from '../../lib/compose/token-estimate'
import { packHotWindow } from '../../lib/compose/hot-window'
import { buildIntelSnapshot } from '../../lib/intel-library/from-stores'
import { libraryCounts } from '../../lib/intel-library/library'
import { HistoryRail } from './history-rail'
import { ComposeSettings } from './compose-settings'
import { ComposeChat } from './compose-chat'
import { DraftDrawer } from './draft-drawer'

export function ComposeWorkspace() {
  const { data: models } = useModels('text')
  const activeThreadId = useComposeStore((s) => s.activeThreadId)
  const threads = useComposeStore((s) => s.threads)
  const ensureActiveThread = useComposeStore((s) => s.ensureActiveThread)
  const newThreadContext = useComposeStore((s) => s.newThreadContext)
  const model = useComposeStore((s) => s.model)
  const setModel = useComposeStore((s) => s.setModel)
  const setContextLimit = useComposeStore((s) => s.setContextLimit)
  const contextLimit = useComposeStore((s) => s.contextLimit)
  const libraryMode = useComposeStore((s) => s.libraryMode)
  const setLibraryMode = useComposeStore((s) => s.setLibraryMode)
  const budgetPct = useComposeStore((s) => s.budgetPct)
  const setBudgetPct = useComposeStore((s) => s.setBudgetPct)
  const dayWindowDays = useComposeStore((s) => s.dayWindowDays)
  const setDayWindowDays = useComposeStore((s) => s.setDayWindowDays)

  const reports = useXIntelStore((s) => s.reports)
  const selfAccounts = useXSelfStore((s) => s.accounts)

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

  return (
    <div className="flex h-full min-h-0">
      <HistoryRail />
      <ComposeSettings
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
      <div className="flex-1 min-w-0 relative flex flex-col min-h-0">
        {threadId ? <ComposeChat threadId={threadId} sendBlocked={sendBlocked} /> : null}
        <DraftDrawer />
      </div>
    </div>
  )
}
