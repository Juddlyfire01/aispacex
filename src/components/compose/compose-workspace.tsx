import { useEffect, useMemo, useState } from 'react'
import { useComposeStore } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { useModels } from '../../hooks/use-models'
import { pickComposeModel, modelIdSupportsFunctionCalling, pickDefaultDraftModel } from '../../lib/compose/model'
import { DRAFT_MODEL_SAME } from '../../lib/compose/draft-writer-tool'
import { computeHotBudget, resolveContextLimit } from '../../lib/compose/token-estimate'
import { packHotWindowCached } from '../../lib/compose/hot-window'
import { buildIntelSnapshot } from '../../lib/intel-library/from-stores'
import { libraryCounts } from '../../lib/intel-library/library'
import { SubTabs } from '../ui/sub-tabs'
import { HistoryRail } from './history-rail'
import { ComposeSettings } from './compose-settings'
import { ComposeChat } from './compose-chat'
import { DraftDrawer } from './draft-drawer'

/** Mirrors You/Others Profile | Feed | Network chrome; only Profile is wired today. */
const POST_SUB_TABS = [
  { id: 'profile' as const, label: 'Profile' },
  { id: 'feed' as const, label: 'Feed' },
  { id: 'network' as const, label: 'Network' },
]

type PostSubTab = (typeof POST_SUB_TABS)[number]['id']

function PostSubTabPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6">
      <p className="text-[11px] text-[var(--color-text-tertiary)] text-center">
        {label} — coming soon
      </p>
    </div>
  )
}

export function ComposeWorkspace() {
  const { data: models, defaultModelId, mostUncensoredModelId } = useModels('text')
  const activeThreadId = useComposeStore((s) => s.activeThreadId)
  const threads = useComposeStore((s) => s.threads)
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

  const reports = useXIntelStore((s) => s.reports)
  const selfAccounts = useXSelfStore((s) => s.accounts)

  const [activeSubTab, setActiveSubTab] = useState<PostSubTab>('profile')

  // Resolve default once the list loads; migrate off models that cannot call tools.
  useEffect(() => {
    if (!models || models.length === 0) return
    if (!model || !modelIdSupportsFunctionCalling(models, model)) {
      setModel(pickComposeModel(models))
    }
  }, [model, models, setModel])

  // Seed draft writer to Venice most_uncensored (latest Uncensored SKU).
  // Migrate prior mistaken seed that used catalog `default` (GLM) as writer default.
  useEffect(() => {
    if (!models || models.length === 0) return
    const preferred = pickDefaultDraftModel(models, mostUncensoredModelId)
    if (!draftModel) {
      setDraftModel(preferred)
      return
    }
    if (draftModel === DRAFT_MODEL_SAME) return
    if (!models.some((m) => m.id === draftModel)) {
      setDraftModel(preferred)
      return
    }
    if (
      defaultModelId &&
      mostUncensoredModelId &&
      draftModel === defaultModelId &&
      draftModel !== mostUncensoredModelId
    ) {
      setDraftModel(mostUncensoredModelId)
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
      <HistoryRail />

      <div className="flex flex-col flex-1 min-w-0">
        <SubTabs
          tabs={POST_SUB_TABS}
          value={activeSubTab}
          onChange={setActiveSubTab}
          className="px-4"
          size="sm"
        />

        <div className="flex-1 min-h-0">
          {activeSubTab === 'profile' && (
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
              <div className="flex-1 min-w-0 relative flex flex-col min-h-0">
                {threadId ? <ComposeChat threadId={threadId} sendBlocked={sendBlocked} /> : null}
                <DraftDrawer />
              </div>
            </div>
          )}
          {activeSubTab === 'feed' && <PostSubTabPlaceholder label="Feed" />}
          {activeSubTab === 'network' && <PostSubTabPlaceholder label="Network" />}
        </div>
      </div>
    </div>
  )
}
