import { useComposeStore, type XSearchMode, type WebSearchMode } from '../../stores/compose-store'
import { useModels } from '../../hooks/use-models'
import {
  modelSupportsXSearch,
  pickComposeModel,
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
  const model = useComposeStore((s) => s.model)
  const setModel = useComposeStore((s) => s.setModel)
  const draftModel = useComposeStore((s) => s.draftModel)
  const setDraftModel = useComposeStore((s) => s.setDraftModel)
  const xSearch = useComposeStore((s) => s.xSearch)
  const setXSearch = useComposeStore((s) => s.setXSearch)
  const webSearch = useComposeStore((s) => s.webSearch)
  const setWebSearch = useComposeStore((s) => s.setWebSearch)
  const xSearchSupported = modelSupportsXSearch(toolModels, model)

  return (
    <aside className="w-[340px] shrink-0 border-r border-[var(--color-border-faint)] flex flex-col max-h-[55vh] md:max-h-none bg-[var(--color-bg-base)]">
      <div className="p-4 flex flex-col gap-4 overflow-y-auto min-h-0 flex-1">
        <div>
          <Label
            htmlFor="compose-model"
            title="Researches and chats; Draft Model streams the post into the drawer."
          >
            Research Model
          </Label>
          <select
            id="compose-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-[var(--color-border-strong)] max-w-full"
          >
            {toolModels.map((m) => {
              const name = m.model_spec?.name || m.id
              const isPinned = m.id === researchDefaultId
              return (
                <option key={m.id} value={m.id}>
                  {name}{isPinned ? ' · default' : ''}
                </option>
              )
            })}
            {model && !toolModels.some((m) => m.id === model) && (
              <option value={model}>{model} (no tools — switch)</option>
            )}
          </select>
        </div>

        <div>
          <Label
            htmlFor="compose-draft-model"
            title="Writes post copy when the research model hands off"
          >
            Draft Model
          </Label>
          <select
            id="compose-draft-model"
            value={draftModel || DRAFT_MODEL_SAME}
            onChange={(e) => setDraftModel(e.target.value)}
            className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-[var(--color-border-strong)] max-w-full"
          >
            <option value={DRAFT_MODEL_SAME}>Same as main</option>
            {writerModels.map((m) => {
              const name = m.model_spec?.name || m.id
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
            value={webSearch}
            onChange={(v) => setWebSearch(v as WebSearchMode)}
          />
        </div>

        <div>
          <Label>X search</Label>
          <PillGroup
            ariaLabel="X search mode"
            options={X_SEARCH_MODES}
            value={xSearchSupported ? xSearch : 'off'}
            onChange={(v) => setXSearch(v as XSearchMode)}
            disabled={!xSearchSupported}
          />
          {!xSearchSupported && (
            <p className="mt-1 text-[10px] text-amber-400/60">Selected model lacks X search</p>
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
