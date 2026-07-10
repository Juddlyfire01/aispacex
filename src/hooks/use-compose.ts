import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useComposeStore } from '../stores/compose-store'
import { useXSelfStore } from '../stores/x-self-store'
import { useXIntelStore } from '../stores/x-intel-store'
import { buildComposeSystem, buildHotUserPrefix } from '../lib/compose/compose-prompt'
import { parseDraftBlock } from '../lib/compose/draft-block'
import { syncDraftForVerification, applyLongformPreference } from '../lib/compose/verified-features'
import { getActiveAccountVerified } from './use-compose-verified'
import { buildIntelSnapshot } from '../lib/intel-library/from-stores'
import { packHotWindow } from '../lib/compose/hot-window'
import { computeHotBudget } from '../lib/compose/token-estimate'
import { runComposeAgent } from '../lib/compose/compose-agent'
import {
  describeToolCall,
  describeToolProgress,
  describeToolResult,
  isToolError,
  newAgentEventId,
} from '../lib/compose/agent-events'
import { buildHistorySnapshot } from '../lib/compose/history-library'
import type { ModelsQueryResult } from '../lib/venice-model-utils'
import type { ChatMessage } from '../types/venice'

// Compose chat via streaming intel agent: packs a hot-window of local library
// data, may call intel_* / compose_history_* tools (tool rounds stream
// activity, final answer streams tokens), then extracts ```postdraft into the
// thread draft and leaves clean prose in the transcript.

export function useCompose() {
  const abortRef = useRef<AbortController | null>(null)
  /** Coalesce SSE tokens into one store write per animation frame. */
  const pendingDeltaRef = useRef('')
  const deltaRafRef = useRef<number | null>(null)
  const queryClient = useQueryClient()
  const {
    isStreaming,
    ensureActiveThread,
    addMessage,
    appendToLastAssistant,
    setLastAssistantContent,
    applyDraftPatch,
    setStreaming,
  } = useComposeStore()

  const flushPendingDelta = useCallback((threadId: string) => {
    if (deltaRafRef.current != null) {
      cancelAnimationFrame(deltaRafRef.current)
      deltaRafRef.current = null
    }
    const pending = pendingDeltaRef.current
    if (!pending) return
    pendingDeltaRef.current = ''
    useComposeStore.getState().appendToLastAssistant(threadId, pending)
  }, [])

  const send = useCallback(
    async (userMessage: string): Promise<void> => {
      const store = useComposeStore.getState()
      const threadId = store.ensureActiveThread()
      const thread = useComposeStore.getState().threads[threadId]
      if (!thread) return

      store.addMessage(threadId, { role: 'user', content: userMessage })
      store.addMessage(threadId, { role: 'assistant', content: '' })
      store.setStreaming(true)
      store.clearAgentEvents()
      store.setAgentPhase('Thinking')
      pendingDeltaRef.current = ''
      if (deltaRafRef.current != null) {
        cancelAnimationFrame(deltaRafRef.current)
        deltaRafRef.current = null
      }

      const abortController = new AbortController()
      abortRef.current = abortController
      let clearedToolActivity = false
      /** Maps in-flight tool calls (name+args) → timeline event ids. */
      const pendingEventIds = new Map<string, string>()

      try {
        const selfAccounts = Object.values(useXSelfStore.getState().accounts)
        const reports = Object.values(useXIntelStore.getState().reports)
        const snapshot = buildIntelSnapshot({ selfAccounts, reports })
        const scope = useComposeStore.getState().threads[threadId]?.context ?? thread.context

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
            threadId,
            `Hot window is over budget (~${pack.estimatedTokens.toLocaleString()} tokens vs budget ${budget.toLocaleString()}). ` +
              `Raise the budget, shorten the day window, switch to Auto, or narrow context — then try again.`,
          )
          return
        }

        const xSearchOn = xSearch !== 'off'
        const system = buildComposeSystem({ modelId: model, xSearchOn, toolsEnabled: true })

        // Transcript minus the trailing empty assistant placeholder.
        // UI stores raw userMessage; API latest user turn includes hot prefix.
        const active = useComposeStore.getState().threads[threadId]
        const history = (active?.messages ?? []).filter((m) =>
          typeof m.content === 'string' ? m.content !== '' : true,
        )
        // Strip UI-only agentEvents before sending to Venice.
        const apiHistory = history.map((m, i) => {
          const { agentEvents: _ae, ...rest } = m
          if (i === history.length - 1 && rest.role === 'user' && typeof rest.content === 'string') {
            return { ...rest, content: buildHotUserPrefix(pack.text, userMessage) }
          }
          return rest
        })
        const apiMessages: ChatMessage[] = [{ role: 'system', content: system }, ...apiHistory]

        const composeState = useComposeStore.getState()
        const historySnapshot = buildHistorySnapshot(
          composeState.threads,
          composeState.threadOrder,
        )

        const modelsCache = queryClient.getQueryData<ModelsQueryResult>(['models', 'text'])
        const modelSpec = modelsCache?.models.find((m) => m.id === model) ?? null

        const { content } = await runComposeAgent({
          model,
          modelSpec,
          messages: apiMessages,
          snapshot,
          historySnapshot,
          scope,
          xSearchOn,
          signal: abortController.signal,
          onDelta: (token) => {
            if (!clearedToolActivity) {
              clearedToolActivity = true
              useComposeStore.getState().setAgentPhase('Writing')
            }
            pendingDeltaRef.current += token
            if (deltaRafRef.current == null) {
              deltaRafRef.current = requestAnimationFrame(() => {
                deltaRafRef.current = null
                const pending = pendingDeltaRef.current
                if (!pending) return
                pendingDeltaRef.current = ''
                useComposeStore.getState().appendToLastAssistant(threadId, pending)
              })
            }
          },
          onContentReset: () => {
            flushPendingDelta(threadId)
            useComposeStore.getState().setLastAssistantContent(threadId, '')
            clearedToolActivity = false
          },
          onRoundStart: () => {
            const s = useComposeStore.getState()
            if (s.agentEvents.length > 0) s.setAgentPhase('Thinking')
          },
          onTool: ({ name, args }) => {
            flushPendingDelta(threadId)
            const s = useComposeStore.getState()
            const label = describeToolCall(name, args)
            const progressLabel = describeToolProgress(name, args)
            const id = newAgentEventId()
            pendingEventIds.set(`${name}:${JSON.stringify(args)}`, id)
            s.pushAgentEvent({
              id,
              label,
              progressLabel,
              status: 'running',
              startedAt: Date.now(),
            })
            s.setAgentPhase(null)
            clearedToolActivity = false
          },
          onToolResult: ({ name, args, result }) => {
            const s = useComposeStore.getState()
            const key = `${name}:${JSON.stringify(args)}`
            const id = pendingEventIds.get(key)
            pendingEventIds.delete(key)
            if (!id) return
            s.updateAgentEvent(id, {
              status: isToolError(result) ? 'error' : 'done',
              detail: describeToolResult(name, result),
            })
          },
        })

        flushPendingDelta(threadId)

        // Finalize: strip ```postdraft into the draft drawer; keep clean prose in chat.
        const finishedStore = useComposeStore.getState()
        if (content) {
          const { draft, visibleText } = parseDraftBlock(content)
          if (draft) {
            const isVerified = getActiveAccountVerified()
            const pref = finishedStore.longformPreference
            const withPref = applyLongformPreference(draft, pref)
            const gated = syncDraftForVerification(withPref, isVerified, pref)
            finishedStore.applyDraftPatch(threadId, gated ? { ...withPref, ...gated } : withPref)
            finishedStore.setDraftDrawerOpen(true)
            finishedStore.setLastAssistantContent(threadId, visibleText || 'Draft updated.')
          } else {
            finishedStore.setLastAssistantContent(threadId, content)
          }
        } else {
          finishedStore.setLastAssistantContent(threadId, '')
        }
      } catch (err) {
        flushPendingDelta(threadId)
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        useComposeStore.getState().setLastAssistantContent(threadId, `[Error: ${message}]`)
      } finally {
        flushPendingDelta(threadId)
        const s = useComposeStore.getState()
        // Settle interrupted steps, then pin the full timeline onto this turn.
        for (const e of s.agentEvents) {
          if (e.status === 'running') s.updateAgentEvent(e.id, { status: 'done' })
        }
        const finalEvents = useComposeStore.getState().agentEvents
        if (finalEvents.length > 0) {
          s.setLastAssistantAgentEvents(threadId, finalEvents)
        }
        s.setStreaming(false)
        s.setAgentPhase(null)
        // Live strip is cleared; history lives on the assistant message.
        s.clearAgentEvents()
        abortRef.current = null
      }
    },
    // store actions are stable; active thread read fresh via getState in send
    [
      queryClient,
      ensureActiveThread,
      addMessage,
      appendToLastAssistant,
      setLastAssistantContent,
      applyDraftPatch,
      setStreaming,
      flushPendingDelta,
    ],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    if (deltaRafRef.current != null) {
      cancelAnimationFrame(deltaRafRef.current)
      deltaRafRef.current = null
    }
    pendingDeltaRef.current = ''
    const s = useComposeStore.getState()
    for (const e of s.agentEvents) {
      if (e.status === 'running') s.updateAgentEvent(e.id, { status: 'done' })
    }
    const finalEvents = useComposeStore.getState().agentEvents
    const threadId = s.activeThreadId
    if (threadId && finalEvents.length > 0) {
      s.setLastAssistantAgentEvents(threadId, finalEvents)
    }
    s.setStreaming(false)
    s.setAgentPhase(null)
    s.clearAgentEvents()
  }, [setStreaming])

  return { send, stop, isStreaming }
}
