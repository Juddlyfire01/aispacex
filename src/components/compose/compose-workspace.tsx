import { useCallback, useEffect, useMemo, useState } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import {
  useComposePrefsStore,
  composeScopeKey,
  type PostSubTab,
} from '../../stores/compose-prefs-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { useModels } from '../../hooks/use-models'
import {
  pickComposeModel,
  pickDefaultDraftModel,
  formatComposeResearchLabel,
  shouldUpgradeComposeResearchModel,
  shouldUpgradeDraftModel,
} from '../../lib/compose/model'
import { DRAFT_MODEL_SAME } from '../../lib/compose/draft-writer-tool'
import {
  computeHotBudget,
  DEFAULT_CONTEXT_FALLBACK,
  resolveContextLimit,
} from '../../lib/compose/token-estimate'
import { packHotWindowCached } from '../../lib/compose/hot-window'
import { buildIntelSnapshot } from '../../lib/intel-library/from-stores'
import { libraryCounts } from '../../lib/intel-library/library'
import type { LibraryCounts } from '../../lib/intel-library/types'
import type { PackResult } from '../../lib/compose/hot-window'
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
  const newThreadContext = useComposePrefsStore((s) => s.newThreadContext)
  const model = useComposePrefsStore((s) => s.model)
  const setModel = useComposePrefsStore((s) => s.setModel)
  const draftModel = useComposePrefsStore((s) => s.draftModel)
  const setDraftModel = useComposePrefsStore((s) => s.setDraftModel)
  const setContextLimit = useComposeStore((s) => s.setContextLimit)
  const contextLimit = useComposeStore((s) => s.contextLimit)
  const libraryMode = useComposePrefsStore((s) => s.libraryMode)
  const setLibraryMode = useComposePrefsStore((s) => s.setLibraryMode)
  const budgetPct = useComposePrefsStore((s) => s.budgetPct)
  const setBudgetPct = useComposePrefsStore((s) => s.setBudgetPct)
  const dayWindowDays = useComposePrefsStore((s) => s.dayWindowDays)
  const setDayWindowDays = useComposePrefsStore((s) => s.setDayWindowDays)
  const draftDrawerOpen = useComposePrefsStore((s) => s.draftDrawerOpen)
  const draftDrawerWidthPct = useComposePrefsStore((s) => s.draftDrawerWidthPct)

  const reports = useXIntelStore((s) => s.reports)
  const selfAccounts = useXSelfStore((s) => s.accounts)

  const activeSubTab = useComposePrefsStore((s) => s.activePostSubTab)
  const setActiveSubTab = useComposePrefsStore((s) => s.setActivePostSubTab)
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

  // Prefs live in a small encrypted blob — wait for that (ms), not the thread corpus.
  const [prefsHydrated, setPrefsHydrated] = useState(() =>
    useComposePrefsStore.persist.hasHydrated(),
  )
  useEffect(() => {
    const unsub = useComposePrefsStore.persist.onFinishHydration(() => setPrefsHydrated(true))
    if (useComposePrefsStore.persist.hasHydrated()) setPrefsHydrated(true)
    return unsub
  }, [])
  const migratedFromCompose = useComposePrefsStore((s) => s.migratedFromCompose)

  // Research model: latest standard Grok (tool + X search). Follows catalog upgrades
  // when the user was still on the previous default. Wait for legacy seed so we
  // don't write pickComposeModel() over prefs that are about to arrive from compose.
  useEffect(() => {
    if (!prefsHydrated || !migratedFromCompose) return
    if (!models || models.length === 0) return
    if (shouldUpgradeComposeResearchModel(model, models)) {
      const nextId = pickComposeModel(models)
      const next = models.find((m) => m.id === nextId)
      setModel(
        nextId,
        next ? formatComposeResearchLabel(next, nextId) : nextId,
      )
    }
  }, [prefsHydrated, migratedFromCompose, model, models, setModel])

  // Draft stage model: default Same as research (same id, still a separate
  // draft-stage completion). Only auto-upgrade when user picked a specific
  // Venice Uncensored SKU that Venice retagged.
  useEffect(() => {
    if (!prefsHydrated || !migratedFromCompose) return
    if (!models || models.length === 0) return
    if (!draftModel) {
      setDraftModel(DRAFT_MODEL_SAME)
      return
    }
    if (draftModel === DRAFT_MODEL_SAME) return
    if (shouldUpgradeDraftModel(draftModel, models, mostUncensoredModelId, defaultModelId)) {
      setDraftModel(pickDefaultDraftModel(models, mostUncensoredModelId))
    }
  }, [
    prefsHydrated,
    migratedFromCompose,
    draftModel,
    models,
    mostUncensoredModelId,
    defaultModelId,
    setDraftModel,
  ])

  // Keep contextLimit in sync with the selected model for hot-window budgeting.
  useEffect(() => {
    if (!prefsHydrated) return
    if (!model) return
    const modelObj = models?.find((m) => m.id === model)
    const next = resolveContextLimit(modelObj)
    setContextLimit(next)
    if (modelObj && typeof modelObj.model_spec?.availableContextTokens === 'number') {
      useComposePrefsStore.getState().setLastContextLimit(next)
    }
  }, [prefsHydrated, model, models, setContextLimit])

  useEffect(() => {
    ensureActiveThread()
  }, [ensureActiveThread])

  const threadId = activeThreadId && activeThread ? activeThreadId : null

  const modelObj = useMemo(() => models?.find((m) => m.id === model), [models, model])
  const lastContextLimit = useComposePrefsStore((s) => s.lastContextLimit)
  const hotMeter = useComposePrefsStore((s) => s.hotMeter)
  const setHotMeter = useComposePrefsStore((s) => s.setHotMeter)

  // Prefer live catalog limit; fall back to last persisted limit before models load.
  const displayContextLimit =
    typeof modelObj?.model_spec?.availableContextTokens === 'number' &&
    modelObj.model_spec.availableContextTokens > 0
      ? modelObj.model_spec.availableContextTokens
      : lastContextLimit > 0
        ? lastContextLimit
        : contextLimit > 0
          ? contextLimit
          : DEFAULT_CONTEXT_FALLBACK

  const limitAssumed = !(
    typeof modelObj?.model_spec?.availableContextTokens === 'number' &&
    modelObj.model_spec.availableContextTokens > 0
  )
  // Cached context limit is a real prior measurement — don't show the † assumed mark.
  const displayLimitAssumed = limitAssumed && !(lastContextLimit > 0)

  const [intelHydrated, setIntelHydrated] = useState(() => useXIntelStore.persist.hasHydrated())
  const [selfHydrated, setSelfHydrated] = useState(() => useXSelfStore.persist.hasHydrated())
  useEffect(() => {
    const u1 = useXIntelStore.persist.onFinishHydration(() => setIntelHydrated(true))
    const u2 = useXSelfStore.persist.onFinishHydration(() => setSelfHydrated(true))
    if (useXIntelStore.persist.hasHydrated()) setIntelHydrated(true)
    if (useXSelfStore.persist.hasHydrated()) setSelfHydrated(true)
    return () => {
      u1()
      u2()
    }
  }, [])
  const corpusReady = intelHydrated && selfHydrated

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
  const scopeKey = composeScopeKey(scope)

  const budget = useMemo(
    () => computeHotBudget(displayContextLimit, budgetPct),
    [displayContextLimit, budgetPct],
  )

  const livePack = useMemo(
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

  const liveCounts = useMemo(() => libraryCounts(snapshot, scope), [snapshot, scope])

  const cachedMeter =
    hotMeter && hotMeter.scopeKey === scopeKey ? hotMeter : null
  const useOptimisticMeter =
    Boolean(cachedMeter) &&
    (!corpusReady || (liveCounts.posts === 0 && liveCounts.reports === 0 && cachedMeter!.posts + cachedMeter!.reports > 0))

  const pack: PackResult = useOptimisticMeter
    ? {
        ...livePack,
        estimatedTokens: cachedMeter!.estimatedTokens,
      }
    : livePack

  const counts: LibraryCounts = useOptimisticMeter
    ? {
        ...liveCounts,
        posts: cachedMeter!.posts,
        reports: cachedMeter!.reports,
      }
    : liveCounts

  // Persist meter once corpus is live so the next mount can paint immediately.
  useEffect(() => {
    if (!corpusReady) return
    if (liveCounts.posts === 0 && liveCounts.reports === 0 && livePack.estimatedTokens === 0) {
      return
    }
    const next = {
      scopeKey,
      estimatedTokens: livePack.estimatedTokens,
      contextLimit: displayContextLimit,
      budgetPct,
      posts: liveCounts.posts,
      reports: liveCounts.reports,
      limitAssumed: displayLimitAssumed,
    }
    const prev = useComposePrefsStore.getState().hotMeter
    if (
      prev &&
      prev.scopeKey === next.scopeKey &&
      prev.estimatedTokens === next.estimatedTokens &&
      prev.contextLimit === next.contextLimit &&
      prev.budgetPct === next.budgetPct &&
      prev.posts === next.posts &&
      prev.reports === next.reports &&
      prev.limitAssumed === next.limitAssumed
    ) {
      return
    }
    setHotMeter(next)
  }, [
    corpusReady,
    scopeKey,
    livePack.estimatedTokens,
    displayContextLimit,
    budgetPct,
    liveCounts.posts,
    liveCounts.reports,
    displayLimitAssumed,
    setHotMeter,
  ])

  const sendBlocked = libraryMode === 'custom' && livePack.overBudget

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
                contextLimit={displayContextLimit}
                budgetPct={budgetPct}
                libraryMode={libraryMode}
                dayWindowDays={dayWindowDays}
                counts={counts}
                limitAssumed={displayLimitAssumed}
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
