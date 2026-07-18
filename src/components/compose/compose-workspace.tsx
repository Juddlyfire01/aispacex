import { useCallback, useEffect, useMemo, useState } from 'react'
import { useComposeStore, type PostSubTab } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { useModels } from '../../hooks/use-models'
import {
  pickComposeModel,
  pickDefaultDraftModel,
  shouldUpgradeComposeResearchModel,
  shouldUpgradeDraftModel,
} from '../../lib/compose/model'
import { DRAFT_MODEL_SAME } from '../../lib/compose/draft-writer-tool'
import { computeHotBudget, resolveContextLimit } from '../../lib/compose/token-estimate'
import { packHotWindowCached } from '../../lib/compose/hot-window'
import { buildIntelSnapshot } from '../../lib/intel-library/from-stores'
import { libraryCounts } from '../../lib/intel-library/library'
import type { PerformanceSelection } from '../../lib/compose/performance-context'
import { selectSelfAccount } from '../../lib/x-intel/self-orchestrate'
import { SubTabs } from '../ui/sub-tabs'
import { HistoryRail } from './history-rail'
import { PerformanceProfileRail } from './performance-profile-rail'
import { ComposeSettings } from './compose-settings'
import { ComposeChat } from './compose-chat'
import { DraftDrawer } from './draft-drawer'
import { DraftSplitHandle } from './draft-split-handle'
import { PerformanceView } from './performance-view'
import { AlphaView } from './alpha/alpha-view'

/** Post chrome: Composer | Alpha | Performance. */
const POST_SUB_TABS: { id: PostSubTab; label: string }[] = [
  { id: 'composer', label: 'Composer' },
  { id: 'alpha', label: 'Alpha' },
  { id: 'performance', label: 'Performance' },
]

export function ComposeWorkspace() {
  const { data: models, defaultModelId, mostUncensoredModelId } = useModels('text')
  const activeThreadId = useComposeStore((s) => s.activeThreadId)
  const activeThread = useComposeStore((s) =>
    s.activeThreadId ? s.threads[s.activeThreadId] : undefined,
  )
  const ensureActiveThread = useComposeStore((s) => s.ensureActiveThread)
  const newThreadContext = useComposeStore((s) => s.newThreadContext)
  const model = useComposeStore((s) => s.model)
  const setModel = useComposeStore((s) => s.setModel)
  const draftModel = useComposeStore((s) => s.draftModel)
  const setDraftModel = useComposeStore((s) => s.setDraftModel)
  const setContextLimit = useComposeStore((s) => s.setContextLimit)
  const contextLimit = useComposeStore((s) => s.contextLimit)
  const libraryMode = useComposeStore((s) => s.libraryMode)
  const setLibraryMode = useComposeStore((s) => s.setLibraryMode)
  const budgetPct = useComposeStore((s) => s.budgetPct)
  const setBudgetPct = useComposeStore((s) => s.setBudgetPct)
  const dayWindowDays = useComposeStore((s) => s.dayWindowDays)
  const setDayWindowDays = useComposeStore((s) => s.setDayWindowDays)
  const draftDrawerOpen = useComposeStore((s) => s.draftDrawerOpen)
  const draftDrawerWidthPct = useComposeStore((s) => s.draftDrawerWidthPct)

  const reports = useXIntelStore((s) => s.reports)
  const selfAccounts = useXSelfStore((s) => s.accounts)

  const activeSubTab = useComposeStore((s) => s.activePostSubTab)
  const setActiveSubTab = useComposeStore((s) => s.setActivePostSubTab)
  /** Performance-only profile pick; independent of compose thread history. */
  const [perfSelection, setPerfSelection] = useState<PerformanceSelection | null>(null)
  const activeAccountId = useXSelfStore((s) => s.activeAccountId)

  const handlePerfSelect = useCallback(
    (next: PerformanceSelection) => {
      setPerfSelection(next)
      // Keep OAuth/active self in sync when reviewing a connected account.
      if (next.kind === 'me' && next.accountId !== activeAccountId) {
        void selectSelfAccount(next.accountId)
      }
    },
    [activeAccountId],
  )

  // Research model: latest standard Grok (tool + X search). Follows catalog upgrades
  // when the user was still on the previous default.
  useEffect(() => {
    if (!models || models.length === 0) return
    if (shouldUpgradeComposeResearchModel(model, models)) {
      setModel(pickComposeModel(models))
    }
  }, [model, models, setModel])

  // Draft stage model: default Same as research (same id, still a separate
  // draft-stage completion). Only auto-upgrade when user picked a specific
  // Venice Uncensored SKU that Venice retagged.
  useEffect(() => {
    if (!models || models.length === 0) return
    if (!draftModel) {
      setDraftModel(DRAFT_MODEL_SAME)
      return
    }
    if (draftModel === DRAFT_MODEL_SAME) return
    if (shouldUpgradeDraftModel(draftModel, models, mostUncensoredModelId, defaultModelId)) {
      setDraftModel(pickDefaultDraftModel(models, mostUncensoredModelId))
    }
  }, [draftModel, models, mostUncensoredModelId, defaultModelId, setDraftModel])

  // Keep contextLimit in sync with the selected model for hot-window budgeting.
  useEffect(() => {
    const modelObj = models?.find((m) => m.id === model)
    setContextLimit(resolveContextLimit(modelObj))
  }, [model, models, setContextLimit])

  useEffect(() => {
    ensureActiveThread()
  }, [ensureActiveThread])

  const threadId = activeThreadId && activeThread ? activeThreadId : null

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
      packHotWindowCached({
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
      {activeSubTab === 'performance' ? (
        <PerformanceProfileRail selection={perfSelection} onSelect={handlePerfSelect} />
      ) : activeSubTab === 'alpha' ? null : (
        <HistoryRail />
      )}

      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <SubTabs
          tabs={POST_SUB_TABS}
          value={activeSubTab}
          onChange={setActiveSubTab}
          className="px-4"
          size="sm"
        />

        <div className="flex-1 min-h-0">
          {activeSubTab === 'composer' && (
            <div className="flex h-full min-h-0">
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
              <div className="flex-1 min-w-0 flex min-h-0">
                <div
                  className="min-w-0 min-h-0 flex flex-col"
                  style={{
                    flexGrow: draftDrawerOpen ? 100 - draftDrawerWidthPct : 1,
                    flexShrink: 1,
                    flexBasis: 0,
                    width: draftDrawerOpen ? undefined : '100%',
                  }}
                >
                  {threadId ? (
                    <ComposeChat
                      threadId={threadId}
                      sendBlocked={sendBlocked}
                      hotText={pack.text}
                      hotTokens={pack.estimatedTokens}
                    />
                  ) : null}
                </div>
                {draftDrawerOpen ? (
                  <>
                    <DraftSplitHandle />
                    <div
                      className="min-w-0 min-h-0 flex flex-col border-l border-[var(--color-border-faint)]"
                      style={{
                        flexGrow: draftDrawerWidthPct,
                        flexShrink: 1,
                        flexBasis: 0,
                      }}
                    >
                      <DraftDrawer />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
          {activeSubTab === 'alpha' && <AlphaView />}
          {activeSubTab === 'performance' && (
            <PerformanceView
              selection={perfSelection}
              onSelectionChange={setPerfSelection}
            />
          )}
        </div>
      </div>
    </div>
  )
}
