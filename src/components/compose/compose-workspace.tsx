import { useEffect, useMemo, useState } from 'react'
import { useComposeStore, ME_CONTEXT, ALL_CONTEXT, type XSearchMode } from '../../stores/compose-store'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { useModels } from '../../hooks/use-models'
import { pickComposeModel, modelSupportsXSearch } from '../../lib/compose/model'
import { buildCorpus } from '../../lib/compose/build-corpus'
import type { TargetContext } from '../../lib/compose/compose-prompt'
import { ComposeChat } from './compose-chat'
import { PostComposer } from './post-composer'
import { ComposeActions } from './compose-actions'

const X_SEARCH_MODES: XSearchMode[] = ['off', 'auto', 'on']

export function ComposeWorkspace() {
  const { data: models } = useModels('text')
  const activeContext = useComposeStore((s) => s.activeContext)
  const setActiveContext = useComposeStore((s) => s.setActiveContext)
  const ensureSession = useComposeStore((s) => s.ensureSession)
  const model = useComposeStore((s) => s.model)
  const setModel = useComposeStore((s) => s.setModel)
  const xSearch = useComposeStore((s) => s.xSearch)
  const setXSearch = useComposeStore((s) => s.setXSearch)

  const targets = useXIntelStore((s) => s.targets)
  const reports = useXIntelStore((s) => s.reports)
  const selfAccounts = useXSelfStore((s) => s.accounts)

  const [copied, setCopied] = useState(false)

  // Resolve default once the list loads: highest Grok w/ X search, then fallbacks.
  useEffect(() => {
    if (model || !models || models.length === 0) return
    setModel(pickComposeModel(models))
  }, [model, models, setModel])

  useEffect(() => {
    ensureSession(activeContext)
  }, [activeContext, ensureSession])

  const targetContext: TargetContext | undefined = useMemo(() => {
    if (activeContext === ME_CONTEXT || activeContext === ALL_CONTEXT) return undefined
    const report = reports[activeContext]
    if (!report?.profile) return { username: activeContext }
    return {
      username: report.profile.username,
      displayName: report.profile.displayName,
      bio: report.profile.bio,
      recentPosts: report.posts.slice(0, 20).map((p) => ({ id: p.id, text: p.text, kind: p.kind })),
    }
  }, [activeContext, reports])

  // The "All" context assembles the entire gathered data set into one dump.
  const corpus: string | undefined = useMemo(() => {
    if (activeContext !== ALL_CONTEXT) return undefined
    return (
      buildCorpus({
        selfAccounts: Object.values(selfAccounts),
        reports: Object.values(reports),
      }) || undefined
    )
  }, [activeContext, selfAccounts, reports])

  const xSearchSupported = models ? modelSupportsXSearch(models, model) : false

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-b border-white/[0.05]">
        <label className="flex items-center gap-1.5 text-[11px] text-white/40">
          Context
          <select
            value={activeContext}
            onChange={(e) => setActiveContext(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-faint)] rounded-md px-2 py-1 text-[11px] text-white/70 outline-none"
          >
            <option value={ME_CONTEXT}>Your account</option>
            <option value={ALL_CONTEXT}>All (entire data set)</option>
            {targets.map((t) => (
              <option key={t} value={t}>@{t}</option>
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
                {(m.model_spec?.name || m.id) + (m.model_spec?.capabilities?.supportsXSearch ? ' · X search' : '')}
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
      </div>

      {/* Split view */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 border-r border-white/[0.05]">
          <ComposeChat context={activeContext} targetContext={targetContext} corpus={corpus} />
        </div>
        <div className="w-[46%] max-w-[560px] min-w-0 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <PostComposer context={activeContext} />
          </div>
          <ComposeActions context={activeContext} copied={copied} setCopied={setCopied} />
        </div>
      </div>
    </div>
  )
}
