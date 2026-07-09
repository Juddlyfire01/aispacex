import { useComposeStore, ME_CONTEXT, ALL_CONTEXT, type XSearchMode } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useModels } from '../../hooks/use-models'
import { modelSupportsXSearch } from '../../lib/compose/model'
import { contextKeyFromScope } from '../../lib/intel-library/scope'
import type { ComposeScope } from '../../lib/intel-library/types'
import type { LibraryMode, PackResult } from '../../lib/compose/hot-window'
import type { LibraryCounts } from '../../lib/intel-library/types'
import { Label, PillGroup } from '../ui/shared'
import { LibraryMeter } from './library-meter'

const X_SEARCH_MODES: { value: XSearchMode; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'auto', label: 'auto' },
  { value: 'on', label: 'on' },
]

function scopeFromSelectValue(value: string): ComposeScope {
  if (value === ME_CONTEXT) return { type: 'me' }
  if (value === ALL_CONTEXT) return { type: 'all' }
  return { type: 'target', username: value }
}

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
  const { data: models } = useModels('text')
  const newThreadContext = useComposeStore((s) => s.newThreadContext)
  const setNewThreadContext = useComposeStore((s) => s.setNewThreadContext)
  const model = useComposeStore((s) => s.model)
  const setModel = useComposeStore((s) => s.setModel)
  const xSearch = useComposeStore((s) => s.xSearch)
  const setXSearch = useComposeStore((s) => s.setXSearch)
  const targets = useXIntelStore((s) => s.targets)

  const contextSelectValue = contextKeyFromScope(newThreadContext)
  const xSearchSupported = models ? modelSupportsXSearch(models, model) : false

  return (
    <aside className="md:w-[360px] lg:w-[400px] shrink-0 border-r border-[var(--color-border-faint)] flex flex-col max-h-[55vh] md:max-h-none bg-[var(--color-bg-base)]">
      <div className="p-5 flex flex-col gap-4 overflow-y-auto">
        <div>
          <Label htmlFor="compose-new-context">New chat context</Label>
          <select
            id="compose-new-context"
            value={contextSelectValue}
            onChange={(e) => setNewThreadContext(scopeFromSelectValue(e.target.value))}
            className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-[var(--color-border-strong)]"
          >
            <option value={ME_CONTEXT}>You</option>
            <option value={ALL_CONTEXT}>All</option>
            {targets.map((t) => (
              <option key={t} value={t}>
                @{t}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
            Applies to the next + New chat — does not change the active thread.
          </p>
        </div>

        <div>
          <Label htmlFor="compose-model">Model</Label>
          <select
            id="compose-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1.5 text-[11px] text-white/70 outline-none focus:border-[var(--color-border-strong)] max-w-full"
          >
            {(models ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {(m.model_spec?.name || m.id) +
                  (m.model_spec?.capabilities?.supportsXSearch ? ' · X search' : '')}
              </option>
            ))}
            {model && !models?.some((m) => m.id === model) && (
              <option value={model}>{model}</option>
            )}
          </select>
        </div>

        <div>
          <Label>X search</Label>
          <PillGroup
            ariaLabel="X search mode"
            options={X_SEARCH_MODES}
            value={xSearch}
            onChange={(v) => setXSearch(v as XSearchMode)}
          />
          {!xSearchSupported && xSearch !== 'off' && (
            <p className="mt-1 text-[10px] text-amber-400/60">Selected model lacks X search</p>
          )}
        </div>

        <div>
          <Label>Library</Label>
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
