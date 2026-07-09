import { useCallback, useRef } from 'react'
import { useComposeStore } from '../stores/compose-store'
import { useXSelfStore } from '../stores/x-self-store'
import { useXIntelStore } from '../stores/x-intel-store'
import { buildComposeSystem, buildHotUserPrefix } from '../lib/compose/compose-prompt'
import { parseDraftBlock } from '../lib/compose/draft-block'
import { syncDraftForVerification, applyLongformPreference } from '../lib/compose/verified-features'
import { getActiveAccountVerified } from './use-compose-verified'
import { buildIntelSnapshot } from '../lib/intel-library/from-stores'
import { scopeFromContext } from '../lib/intel-library/scope'
import { packHotWindow } from '../lib/compose/hot-window'
import { computeHotBudget } from '../lib/compose/token-estimate'
import { runComposeAgent } from '../lib/compose/compose-agent'
import type { ChatMessage } from '../types/venice'

// Compose chat via non-streaming intel agent: packs a hot-window of local
// library data, may call intel_* tools, then extracts ```postdraft into the
// session draft and leaves clean prose in the transcript.

export function useCompose() {
  const abortRef = useRef<AbortController | null>(null)
  const {
    activeContext,
    isStreaming,
    ensureSession,
    addMessage,
    setLastAssistantContent,
    applyDraftPatch,
    setStreaming,
    setToolActivity,
  } = useComposeStore()

  const send = useCallback(
    async (userMessage: string): Promise<void> => {
      const store = useComposeStore.getState()
      const context = store.activeContext
      store.ensureSession(context)

      store.addMessage(context, { role: 'user', content: userMessage })
      store.addMessage(context, { role: 'assistant', content: '' })
      store.setStreaming(true)

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        const selfAccounts = Object.values(useXSelfStore.getState().accounts)
        const reports = Object.values(useXIntelStore.getState().reports)
        const snapshot = buildIntelSnapshot({ selfAccounts, reports })
        const scope = scopeFromContext(context)

        const { libraryMode, budgetPct, dayWindowDays, model, xSearch, contextLimit } =
          useComposeStore.getState()
        const budget = computeHotBudget(contextLimit, budgetPct)
        const pack = packHotWindow({
          snapshot,
          scope,
          mode: libraryMode,
          dayWindowDays,
          tokenBudget: budget,
          now: new Date(),
        })

        if (libraryMode === 'custom' && pack.overBudget) {
          store.setLastAssistantContent(
            context,
            `Hot window is over budget (~${pack.estimatedTokens.toLocaleString()} tokens vs budget ${budget.toLocaleString()}). ` +
              `Raise the budget, shorten the day window, switch to Auto, or narrow context — then try again.`,
          )
          return
        }

        const xSearchOn = xSearch !== 'off'
        const system = buildComposeSystem({ xSearchOn, toolsEnabled: true })

        // Transcript minus the trailing empty assistant placeholder.
        // UI stores raw userMessage; API latest user turn includes hot prefix.
        const session = useComposeStore.getState().sessions[context]
        const history = (session?.messages ?? []).filter((m) =>
          typeof m.content === 'string' ? m.content !== '' : true,
        )
        const apiHistory = history.map((m, i) => {
          if (i === history.length - 1 && m.role === 'user' && typeof m.content === 'string') {
            return { ...m, content: buildHotUserPrefix(pack.text, userMessage) }
          }
          return m
        })
        const apiMessages: ChatMessage[] = [{ role: 'system', content: system }, ...apiHistory]

        const { content } = await runComposeAgent({
          model,
          messages: apiMessages,
          snapshot,
          scope,
          xSearchOn,
          signal: abortController.signal,
          onTool: ({ name }) => {
            useComposeStore.getState().setToolActivity(`Library · ${name}`)
          },
        })

        const finishedStore = useComposeStore.getState()
        if (content) {
          const { draft, visibleText } = parseDraftBlock(content)
          if (draft) {
            const isVerified = getActiveAccountVerified()
            const pref = finishedStore.longformPreference
            const withPref = applyLongformPreference(draft, pref)
            const gated = syncDraftForVerification(withPref, isVerified, pref)
            finishedStore.applyDraftPatch(context, gated ? { ...withPref, ...gated } : withPref)
            finishedStore.setLastAssistantContent(context, visibleText || 'Draft updated.')
          } else {
            finishedStore.setLastAssistantContent(context, content)
          }
        } else {
          finishedStore.setLastAssistantContent(context, '')
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        useComposeStore.getState().setLastAssistantContent(context, `[Error: ${message}]`)
      } finally {
        const s = useComposeStore.getState()
        s.setStreaming(false)
        s.setToolActivity(null)
        abortRef.current = null
      }
    },
    // store actions are stable; activeContext read fresh via getState in send
    [ensureSession, addMessage, setLastAssistantContent, applyDraftPatch, setStreaming, setToolActivity],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    const s = useComposeStore.getState()
    s.setStreaming(false)
    s.setToolActivity(null)
  }, [setStreaming, setToolActivity])

  return { send, stop, isStreaming }
}
