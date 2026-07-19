import { useEffect, useState } from 'react'
import {
  useComposePrefsStore,
  type XSearchMode,
  type WebSearchMode,
} from '../../stores/compose-prefs-store'
import { useModels } from '../../hooks/use-models'
import {
  modelSupportsXSearch,
  pickComposeModel,
  formatComposeResearchLabel,
  plainModelDisplayName,
  sortComposeResearchModels,
  sortDraftWriterModels,
} from '../../lib/compose/model'
import { DRAFT_MODEL_SAME } from '../../lib/compose/draft-writer-tool'
import type { LibraryMode, PackResult } from '../../lib/compose/hot-window'
import type { LibraryCounts } from '../../lib/intel-library/types'
import { Label, PillGroup } from '../ui/shared'
import { LibraryMeter } from './library-meter'

const X_SEARCH_MODES: { value: XSearchMode; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'auto', label: 'auto' },
  { value: 'on', label: 'on' },
]

const WEB_SEARCH_MODES: { value: WebSearchMode; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'auto', label: 'auto' },
  { value: 'on', label: 'on' },
]

export interface ComposeSettingsProps {
  pack: PackResult
  budget: number
  contextLimit: number
  budgetPct: number
  libraryMode: LibraryMode
  dayWindowDays: number | null
  counts: LibraryCounts
  limitAssumed: boolean
  onModeChange: (m: LibraryMode) => void
  onBudgetPctChange: (p: number) => void
  onDayWindowChange: (d: number | null) => void
}

export function ComposeSettings({
  pack,
  budget,
  contextLimit,
  budgetPct,
  libraryMode,
  dayWindowDays,
  counts,
  limitAssumed,
  onModeChange,
  onBudgetPctChange,
  onDayWindowChange,
}: ComposeSettingsProps) {
  const { data: models, mostUncensoredModelId } = useModels('text')
  const researchDefaultId = pickComposeModel(models ?? [])
  const toolModels = sortComposeResearchModels(models ?? [], researchDefaultId)
  const writerModels = sortDraftWriterModels(models ?? [], mostUncensoredModelId)
  const model = useComposePrefsStore((s) => s.model)
  const modelLabel = useComposePrefsStore((s) => s.modelLabel)
  const setModel = useComposePrefsStore((s) => s.setModel)
  const draftModel = useComposePrefsStore((s) => s.draftModel)
  const setDraftModel = useComposePrefsStore((s) => s.setDraftModel)
  const xSearch = useComposePrefsStore((s) => s.xSearch)
  const setXSearch = useComposePrefsStore((s) => s.setXSearch)
  const webSearch = useComposePrefsStore((s) => s.webSearch)
  const setWebSearch = useComposePrefsStore((s) => s.setWebSearch)
  const xNewsOn = useComposePrefsStore((s) => s.xNewsOn)
  const setXNewsOn = useComposePrefsStore((s) => s.setXNewsOn)
  const xNewsMaxAgeHours = useComposePrefsStore((s) => s.xNewsMaxAgeHours)
  const setXNewsMaxAgeHours = useComposePrefsStore((s) => s.setXNewsMaxAgeHours)

  // Wait for the small prefs blob (ms), not the heavy thread corpus.
  const [prefsHydrated, setPrefsHydrated] = useState(() =>
    useComposePrefsStore.persist.hasHydrated(),
  )
  useEffect(() => {
    const unsub = useComposePrefsStore.persist.onFinishHydration(() => setPrefsHydrated(true))
    if (useComposePrefsStore.persist.hasHydrated()) setPrefsHydrated(true)
    return unsub
  }, [])
  const migratedFromCompose = useComposePrefsStore((s) => s.migratedFromCompose)
  const modelsReady = Boolean(models?.length)
  // Prefs are ready once hydrated. A stored model id can paint before the Venice
  // catalog returns; only wait on legacy seed when model is still empty.
  const prefsReady = prefsHydrated && (migratedFromCompose || Boolean(model))
  const researchPending = !prefsReady
  const modelInCatalog = toolModels.some((m) => m.id === model)
  const catalogSelected = models?.find((m) => m.id === model)
  const catalogSelectedLabel = catalogSelected
    ? formatComposeResearchLabel(catalogSelected, researchDefaultId)
    : ''
  // Optimistic before catalog: persisted label. Once catalog is up, always use the
  // plain catalog label so every row (including the closed value) matches.
  const researchDisplayLabel = modelsReady
    ? catalogSelectedLabel || modelLabel || model
    : modelLabel || model
  const showStoredResearchOption = prefsReady && Boolean(model) && !modelInCatalog
  const showOrphanResearchModel = showStoredResearchOption && modelsReady
  const xSearchSupported = modelsReady && modelSupportsXSearch(toolModels, model)
  const selectClassName =
    'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-border-strong)] max-w-full disabled:opacity-50'

  // Keep modelLabel aligned with the plain catalog label for the next optimistic paint.
  useEffect(() => {
    if (!prefsReady || !model || !models?.length) return
    const m = models.find((x) => x.id === model)
    if (!m) return
    const next = formatComposeResearchLabel(m, pickComposeModel(models))
    if (modelLabel === next) return
    setModel(model, next)
  }, [prefsReady, models, model, modelLabel, setModel])

  return (
    <aside className="w-[340px] shrink-0 border-r border-[var(--color-border-faint)] flex flex-col max-h-[55vh] md:max-h-none bg-[var(--color-bg-base)]">
      <div className="p-4 flex flex-col gap-4 overflow-y-auto min-h-0 flex-1">
        <div>
          <Label
            htmlFor="compose-model"
            title="Stage 1: tools + chat. Researches, analyzes, then calls compose_write_draft to start the draft stage."
          >
            Research Model
          </Label>
          <select
            id="compose-model"
            value={researchPending ? '' : model}
            onChange={(e) => {
              const id = e.target.value
              const text = e.target.selectedOptions[0]?.text?.trim()
              setModel(id, text || id)
            }}
            disabled={researchPending}
            className={selectClassName}
          >
            {researchPending && <option value="">Loading…</option>}
            {toolModels.map((m) => {
              const label = formatComposeResearchLabel(m, researchDefaultId)
              return (
                <option key={m.id} value={m.id}>
                  {label}
                </option>
              )
            })}
            {showStoredResearchOption && (
              <option value={model}>
                {showOrphanResearchModel
                  ? `${researchDisplayLabel} (no tools — switch)`
                  : researchDisplayLabel}
              </option>
            )}
          </select>
        </div>

        <div>
          <Label
            htmlFor="compose-draft-model"
            title="Stage 2: always a separate write completion that continues the research transcript. Same as research = same model id, still a separate draft stage."
          >
            Draft Model
          </Label>
          <select
            id="compose-draft-model"
            value={prefsReady ? draftModel || DRAFT_MODEL_SAME : ''}
            onChange={(e) => setDraftModel(e.target.value)}
            disabled={!prefsReady}
            className={selectClassName}
          >
            {!prefsReady && <option value="">Loading…</option>}
            <option value={DRAFT_MODEL_SAME}>Same as research</option>
            {writerModels.map((m) => {
              const name = plainModelDisplayName(m.model_spec?.name || m.id)
              const isPinned =
                Boolean(mostUncensoredModelId) && m.id === mostUncensoredModelId
              return (
                <option key={m.id} value={m.id}>
                  {name}{isPinned ? ' · default' : ''}
                </option>
              )
            })}
          </select>
        </div>

        <div>
          <Label title="Venice server-side web search for the current turn">Web search</Label>
          <PillGroup
            ariaLabel="Web search mode"
            options={WEB_SEARCH_MODES}
            value={prefsReady ? webSearch : 'off'}
            onChange={(v) => setWebSearch(v as WebSearchMode)}
            disabled={!prefsReady}
          />
        </div>

        <div>
          <Label>X search</Label>
          <PillGroup
            ariaLabel="X search mode"
            options={X_SEARCH_MODES}
            value={
              !prefsReady
                ? 'off'
                : modelsReady && !xSearchSupported
                  ? 'off'
                  : xSearch
            }
            onChange={(v) => setXSearch(v as XSearchMode)}
            disabled={!prefsReady || (modelsReady && !xSearchSupported)}
          />
          {prefsReady && modelsReady && !xSearchSupported && (
            <p className="mt-1 text-[10px] text-amber-400/60">Selected model lacks X search</p>
          )}
        </div>

        <div>
          <Label title="AI news stories clustered from posts on X (requires connected X account)">
            X News
          </Label>
          <PillGroup
            ariaLabel="X News tools"
            options={[
              { value: 'on', label: 'on' },
              { value: 'off', label: 'off' },
            ]}
            value={prefsReady ? (xNewsOn ? 'on' : 'off') : 'off'}
            onChange={(v) => setXNewsOn(v === 'on')}
            disabled={!prefsReady}
          />
          {prefsReady && xNewsOn && (
            <div className="mt-2">
              <Label htmlFor="compose-x-news-age" title="max_age_hours for x_news_search">
                X News recency
              </Label>
              <select
                id="compose-x-news-age"
                value={String(xNewsMaxAgeHours)}
                onChange={(e) => setXNewsMaxAgeHours(Number(e.target.value))}
                className={selectClassName}
              >
                <option value="6">6 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
                <option value="72">3 days</option>
                <option value="168">7 days</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <Label title="Hot = packed into each send. Cold = on disk, fetched via tools.">
            Hot window
          </Label>
          <LibraryMeter
            pack={pack}
            budget={budget}
            contextLimit={contextLimit}
            budgetPct={budgetPct}
            libraryMode={libraryMode}
            dayWindowDays={dayWindowDays}
            counts={counts}
            limitAssumed={limitAssumed}
            onModeChange={onModeChange}
            onBudgetPctChange={onBudgetPctChange}
            onDayWindowChange={onDayWindowChange}
          />
        </div>
      </div>
    </aside>
  )
}
