import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useComposeStore } from '../stores/compose-store'
import { useXSelfStore } from '../stores/x-self-store'
import { useXIntelStore } from '../stores/x-intel-store'
import { buildComposeSystem, buildHotUserPrefix } from '../lib/compose/compose-prompt'
import { parseDraftBlock } from '../lib/compose/draft-block'
import { looksLikeDraftIntent } from '../lib/compose/article-handoff'
import { syncDraftForVerification, applyLongformPreference } from '../lib/compose/verified-features'
import {
  isRegisterPackEmpty,
  packFromReportRegister,
  resolveRegisterPack,
} from '../lib/compose/register'
import { findReportKey } from '../stores/x-intel-store'
import {
  isDraftHandoffEnabled,
  type DraftWriteBrief,
} from '../lib/compose/draft-writer-tool'
import { runDraftWriter, splitWriterSegments, parseArticleFromWriterText } from '../lib/compose/draft-writer'
import { emptyArticleDraft, emptySegment, type PostDraft } from '../lib/compose/types'
import { getActiveAccountVerified } from './use-compose-verified'
import { buildIntelSnapshot } from '../lib/intel-library/from-stores'
import { packHotWindowCached } from '../lib/compose/hot-window'
import { mergeHotWithNewsBookmarks } from '../lib/compose/news-hot'
import { useNewsStore } from '../stores/news-store'
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
import {
  isContextOverflowError,
  KEEP_RECENT_MIN,
  payloadNeedsCompress,
  planThreadCompress,
  type CompressStage,
} from '../lib/compose/thread-compress'
import { modelSupportsXSearch, filterComposeToolModels } from '../lib/compose/model'
import type { ModelsQueryResult } from '../lib/venice-model-utils'
import type { ChatMessage } from '../types/venice'

// Compose chat via streaming intel agent: packs a hot-window of local library
// data, may call intel_* / compose_history_* tools (tool rounds stream
// activity, final answer streams tokens), then extracts ```postdraft into the
// thread draft and leaves clean prose in the transcript.

export function useCompose() {
  const abortRef = useRef<AbortController | null>(null)
  /** SSE tokens wait here; dripped to the store for a rapid-typing feel. */
  const pendingDeltaRef = useRef('')
  const dripRafRef = useRef<number | null>(null)
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

  /** Push the whole buffer now (tool boundaries, finalize, stop). */
  const flushPendingDelta = useCallback((threadId: string) => {
    if (dripRafRef.current != null) {
      cancelAnimationFrame(dripRafRef.current)
      dripRafRef.current = null
    }
    const pending = pendingDeltaRef.current
    if (!pending) return
    pendingDeltaRef.current = ''
    useComposeStore.getState().appendToLastAssistant(threadId, pending)
  }, [])

  /** Reveal pending tokens in small chunks so the stream reads like fast typing. */
  const scheduleDrip = useCallback((threadId: string) => {
    if (dripRafRef.current != null) return

    const tick = () => {
      dripRafRef.current = null
      const pending = pendingDeltaRef.current
      if (!pending) return

      const backlog = pending.length
      // Base ~3 chars/frame (~180/s); accelerate when the network gets ahead.
      let n: number
      if (backlog > 160) n = Math.ceil(backlog * 0.28)
      else if (backlog > 64) n = 14
      else if (backlog > 20) n = 7
      else n = Math.min(3, backlog)

      // Prefer ending on whitespace so chunks feel word-ish, not mid-glyph.
      let take = n
      if (backlog > n) {
        const window = pending.slice(0, n + 8)
        const sp = window.lastIndexOf(' ')
        const nl = window.lastIndexOf('\n')
        const breakAt = Math.max(sp, nl)
        if (breakAt >= Math.floor(n * 0.45)) take = breakAt + 1
      }

      const chunk = pending.slice(0, take)
      pendingDeltaRef.current = pending.slice(take)
      useComposeStore.getState().appendToLastAssistant(threadId, chunk)

      if (pendingDeltaRef.current) {
        dripRafRef.current = requestAnimationFrame(tick)
      }
    }

    dripRafRef.current = requestAnimationFrame(tick)
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
      if (dripRafRef.current != null) {
        cancelAnimationFrame(dripRafRef.current)
        dripRafRef.current = null
      }

      const abortController = new AbortController()
      abortRef.current = abortController
      let clearedToolActivity = false
      /** Stream index → timeline event id (set on onToolStart, reused on execute). */
      const eventByIndex = new Map<number, string>()
      /** name+args → event id for onToolResult matching. */
      const pendingEventIds = new Map<string, string>()
      const MIN_TOOL_DISPLAY_MS = 1000

      try {
        const selfAccounts = Object.values(useXSelfStore.getState().accounts)
        const reports = Object.values(useXIntelStore.getState().reports)
        const snapshot = buildIntelSnapshot({ selfAccounts, reports })
        const scope = useComposeStore.getState().threads[threadId]?.context ?? thread.context

        const {
          libraryMode,
          budgetPct,
          dayWindowDays,
          model,
          draftModel,
          xSearch,
          webSearch,
          xNewsOn,
          xNewsMaxAgeHours,
          contextLimit,
          preferredFormat,
        } = useComposeStore.getState()
        const premiumCapable = getActiveAccountVerified()
        const budget = computeHotBudget(contextLimit, budgetPct)
        const pack = packHotWindowCached({
          snapshot,
          scope,
          mode: libraryMode,
          dayWindowDays,
          tokenBudget: budget,
          now: new Date(),
        })
        const newsBookmarks = useNewsStore.getState().bookmarks
        const { text: hotText } = mergeHotWithNewsBookmarks(pack.text, newsBookmarks)

        if (libraryMode === 'custom' && pack.overBudget) {
          store.setLastAssistantContent(
            threadId,
            `Hot window is over budget (~${pack.estimatedTokens.toLocaleString()} tokens vs budget ${budget.toLocaleString()}). ` +
              `Raise the budget, shorten the day window, switch to Auto, or narrow context — then try again.`,
          )
          return
        }

        const modelsCacheEarly = queryClient.getQueryData<ModelsQueryResult>(['models', 'text'])
        const toolModels = filterComposeToolModels(modelsCacheEarly?.models ?? [])
        const xSearchOn =
          xSearch !== 'off' && modelSupportsXSearch(toolModels, model)

        const draftRegister = useComposeStore.getState().threads[threadId]?.draft.register
        const selfState = useXSelfStore.getState()
        const selfId = selfState.activeAccountId ?? selfState.accountOrder[0] ?? null
        const selfAccount = selfId ? selfState.accounts[selfId] : null
        const selfActive =
          selfAccount?.reportHistory.find((r) => r.id === selfAccount.activeReportId) ??
          selfAccount?.reportHistory[0] ??
          null
        const youPack =
          selfActive?.narrative.register &&
          !isRegisterPackEmpty(packFromReportRegister(selfActive.narrative.register))
            ? packFromReportRegister(selfActive.narrative.register)
            : null

        const otherUser = draftRegister?.otherUsername?.replace(/^@/, '') ?? ''
        const intelState = useXIntelStore.getState()
        const otherKey = otherUser ? findReportKey(intelState.reports, otherUser) : undefined
        const otherReport = otherKey ? intelState.reports[otherKey] : undefined
        const otherActive =
          otherReport?.reportHistory.find((r) => r.id === otherReport.activeReportId) ??
          otherReport?.reportHistory[0] ??
          null
        const otherPack =
          otherActive?.narrative.register &&
          !isRegisterPackEmpty(packFromReportRegister(otherActive.narrative.register))
            ? packFromReportRegister(otherActive.narrative.register)
            : null

        const registerResolved = resolveRegisterPack({
          draft: draftRegister,
          youPack,
          otherPack,
        })

        const handoff = isDraftHandoffEnabled(draftModel)
        const system = buildComposeSystem({
          modelId: model,
          xSearchOn,
          webSearchOn: webSearch !== 'off',
          xNewsOn,
          toolsEnabled: true,
          registerInject: handoff ? null : registerResolved.inject,
          draftHandoff: handoff,
          preferredFormat,
          premiumCapable,
        })

        // Transcript minus the trailing empty assistant placeholder.
        // UI stores raw userMessage; API latest user turn includes hot prefix.
        const buildApiMessages = (): ChatMessage[] => {
          const active = useComposeStore.getState().threads[threadId]
          const history = (active?.messages ?? []).filter((m) =>
            typeof m.content === 'string' ? m.content !== '' : true,
          )
          const apiHistory = history.map((m, i) => {
            const { agentEvents: _ae, ...rest } = m
            if (i === history.length - 1 && rest.role === 'user' && typeof rest.content === 'string') {
              return { ...rest, content: buildHotUserPrefix(hotText, userMessage) }
            }
            return rest
          })
          return [{ role: 'system', content: system }, ...apiHistory]
        }

        const modelsCache = queryClient.getQueryData<ModelsQueryResult>(['models', 'text'])
        const modelSpec = modelsCache?.models.find((m) => m.id === model) ?? null
        const draftModelSpec =
          handoff && draftModel
            ? (modelsCache?.models.find((m) => m.id === draftModel) ?? null)
            : null

        const pushCompressEvent = (
          label: string,
          progressLabel: string,
          status: 'running' | 'done' = 'done',
          detail?: string,
        ): string => {
          const id = newAgentEventId()
          useComposeStore.getState().pushAgentEvent({
            id,
            label,
            progressLabel,
            detail,
            status,
            startedAt: Date.now(),
          })
          return id
        }

        const onCompressStage = (stage: CompressStage) => {
          switch (stage.kind) {
            case 'read':
              pushCompressEvent(
                'Read thread',
                'Reading thread',
                'done',
                `${stage.messageCount} msgs · archive ${stage.archiveCount}`,
              )
              break
            case 'summarize':
              pushCompressEvent('Summarized earlier turns', 'Summarizing earlier turns', 'running')
              break
            case 'saved':
              {
                const s = useComposeStore.getState()
                const running = s.agentEvents.find(
                  (e) => e.status === 'running' && e.progressLabel.includes('Summarizing'),
                )
                if (running) {
                  s.updateAgentEvent(running.id, {
                    status: 'done',
                    label: 'Summarized earlier turns',
                  })
                }
                pushCompressEvent(
                  'Saved to cold history',
                  'Saving to cold history',
                  'done',
                  `${stage.messageCount} msgs`,
                )
              }
              break
            case 'rebuilt':
              pushCompressEvent(
                'Rebuilt transcript',
                'Rebuilding transcript',
                'done',
                `kept ${stage.keptCount}`,
              )
              break
          }
        }

        const runCompressIfNeeded = async (
          apiMessages: ChatMessage[],
          opts: { force: boolean },
        ): Promise<ChatMessage[]> => {
          const needs =
            opts.force || payloadNeedsCompress(system, apiMessages, contextLimit)
          if (!needs) return apiMessages

          const live = useComposeStore.getState().threads[threadId]?.messages ?? []
          // Need more than KEEP to archive anything meaningful.
          if (live.length <= KEEP_RECENT_MIN && !opts.force) return apiMessages

          useComposeStore.getState().setAgentPhase('Compressing thread')
          const plan = await planThreadCompress({
            messages: live,
            modelId: model,
            modelSpec,
            forceAggressive: opts.force,
            signal: abortController.signal,
            onStage: onCompressStage,
          })
          if (!plan) return apiMessages

          useComposeStore
            .getState()
            .applyThreadCompress(threadId, plan.archive, plan.nextMessages)
          return buildApiMessages()
        }

        let apiMessages = buildApiMessages()
        apiMessages = await runCompressIfNeeded(apiMessages, { force: false })
        // Second pass if still over after a soft compress (very long recent tail).
        if (payloadNeedsCompress(system, apiMessages, contextLimit)) {
          apiMessages = await runCompressIfNeeded(apiMessages, { force: true })
        }

        useComposeStore.getState().setAgentPhase('Thinking')

        const startDraftWriter = (brief: DraftWriteBrief) => {
          const writerBrief: DraftWriteBrief = {
            ...brief,
            preferredFormat: brief.preferredFormat ?? preferredFormat,
            // Articles are not Premium long-form tweets — never carry longform:true into the writer.
            ...( (brief.preferredFormat ?? preferredFormat) === 'article'
              ? { longform: false }
              : {}),
          }
          const prefFormat = writerBrief.preferredFormat ?? preferredFormat
          const wantsArticle = prefFormat === 'article'
          const allowArticleHeuristic = prefFormat === 'auto' || prefFormat === 'article'
          const s0 = useComposeStore.getState()
          s0.setDraftDrawerOpen(true)
          s0.setDraftWriterStreaming(true)
          const seg = emptySegment()
          s0.applyDraftPatch(threadId, {
            segments: [seg],
            ...(writerBrief.target && !wantsArticle ? { target: writerBrief.target } : {}),
            ...(wantsArticle
              ? { article: emptyArticleDraft(), longform: false, target: { kind: 'original' } }
              : {
                  article: undefined,
                  ...(typeof writerBrief.longform === 'boolean'
                    ? { longform: writerBrief.longform }
                    : {}),
                }),
          })

          let networkAcc = ''
          let displayedAcc = ''
          let pendingDraft = ''
          let draftDripRaf: number | null = null
          const writerEventId = newAgentEventId()
          useComposeStore.getState().pushAgentEvent({
            id: writerEventId,
            label: 'Draft writer finished',
            progressLabel: wantsArticle
              ? `Article writer streaming (${draftModel})`
              : `Draft writer streaming (${draftModel})`,
            status: 'running',
            startedAt: Date.now(),
          })

          const applyDisplayed = (text: string) => {
            if (wantsArticle) {
              const parsed = parseArticleFromWriterText(text)
              useComposeStore.getState().patchArticleStream(threadId, {
                title: parsed.title,
                bodyMarkdown: parsed.bodyMarkdown,
              })
              return
            }
            const texts = splitWriterSegments(text)
            const stable = texts.map((segText, i) => ({
              id: i === 0 ? seg.id : `dw_${i}_${seg.id}`,
              text: segText,
              media: [] as { id: string; kind: 'image' | 'video' | 'gif' }[],
            }))
            useComposeStore.getState().applyDraftPatch(threadId, {
              segments: stable,
              article: undefined,
            })
          }

          const flushDraftDrip = () => {
            if (draftDripRaf != null) {
              cancelAnimationFrame(draftDripRaf)
              draftDripRaf = null
            }
            if (pendingDraft) {
              displayedAcc += pendingDraft
              pendingDraft = ''
              applyDisplayed(displayedAcc)
            }
          }

          const scheduleDraftDrip = () => {
            if (draftDripRaf != null) return
            const tick = () => {
              draftDripRaf = null
              const pending = pendingDraft
              if (!pending) return

              const backlog = pending.length
              let n: number
              if (backlog > 160) n = Math.ceil(backlog * 0.28)
              else if (backlog > 64) n = 14
              else if (backlog > 20) n = 7
              else n = Math.min(3, backlog)

              let take = n
              if (backlog > n) {
                const window = pending.slice(0, n + 8)
                const sp = window.lastIndexOf(' ')
                const nl = window.lastIndexOf('\n')
                const breakAt = Math.max(sp, nl)
                if (breakAt >= Math.floor(n * 0.45)) take = breakAt + 1
              }

              const chunk = pending.slice(0, take)
              pendingDraft = pending.slice(take)
              displayedAcc += chunk
              applyDisplayed(displayedAcc)

              if (pendingDraft) draftDripRaf = requestAnimationFrame(tick)
            }
            draftDripRaf = requestAnimationFrame(tick)
          }

          const finishWriter = (status: 'done' | 'error' | 'cancelled', detail: string) => {
            flushDraftDrip()
            useComposeStore.getState().setDraftWriterStreaming(false)
            useComposeStore.getState().updateAgentEvent(writerEventId, {
              status: status === 'cancelled' ? 'done' : status,
              detail,
            })
          }

          void runDraftWriter({
            modelId: draftModel,
            modelSpec: draftModelSpec,
            brief: writerBrief,
            registerInject: registerResolved.inject,
            signal: abortController.signal,
            onDelta: (token) => {
              networkAcc += token
              pendingDraft += token
              scheduleDraftDrip()
            },
          })
            .then((finalText) => {
              flushDraftDrip()
              const store = useComposeStore.getState()
              const text = finalText || networkAcc
              const looksLikeArticle =
                allowArticleHeuristic && /^#\s+\S/.test(text.trim())
              if (wantsArticle || looksLikeArticle) {
                const parsed = parseArticleFromWriterText(text)
                const current = store.threads[threadId]?.draft.article
                store.applyDraftPatch(threadId, {
                  article: {
                    title: parsed.title,
                    bodyMarkdown: parsed.bodyMarkdown,
                    cover: current?.cover,
                    inlineMedia: current?.inlineMedia ?? [],
                    contentState: current?.contentState,
                  },
                  longform: false,
                  target: { kind: 'original' },
                  segments: [emptySegment()],
                })
                finishWriter('done', 'article ready')
                return
              }
              const texts = splitWriterSegments(text)
              const segments =
                texts.length > 0
                  ? texts.map((segText, i) => ({
                      id: i === 0 ? seg.id : `dw_${i}_${seg.id}`,
                      text: segText,
                      media: [],
                    }))
                  : [{ ...seg, text: networkAcc }]
              const isVerified = getActiveAccountVerified()
              const pref = store.longformPreference
              const patch: Partial<PostDraft> = {
                segments,
                article: undefined,
                ...(brief.target ? { target: brief.target } : {}),
                ...(typeof brief.longform === 'boolean' ? { longform: brief.longform } : {}),
              }
              const gated = syncDraftForVerification(
                { ...store.threads[threadId]!.draft, ...patch },
                isVerified,
                pref,
              )
              store.applyDraftPatch(threadId, gated ? { ...patch, ...gated } : patch)
              finishWriter(
                'done',
                texts.length > 1 ? `${texts.length} segments` : 'ready',
              )
            })
            .catch((err) => {
              if (err instanceof DOMException && err.name === 'AbortError') {
                finishWriter('cancelled', 'cancelled')
                return
              }
              const message = err instanceof Error ? err.message : 'Draft writer failed'
              finishWriter('error', message)
            })
        }

        const ensureToolEvent = (
          index: number,
          name: string,
          args: Record<string, unknown>,
        ): string => {
          const existing = eventByIndex.get(index)
          const label = describeToolCall(name, args)
          const progressLabel = describeToolProgress(name, args)
          if (existing) {
            useComposeStore.getState().updateAgentEvent(existing, {
              label,
              progressLabel,
              status: 'running',
            })
            return existing
          }
          const id = newAgentEventId()
          eventByIndex.set(index, id)
          useComposeStore.getState().pushAgentEvent({
            id,
            label,
            progressLabel,
            status: 'running',
            startedAt: Date.now(),
          })
          return id
        }

        const runAgent = async (messages: ChatMessage[]) => {
          const composeState = useComposeStore.getState()
          const historySnapshot = buildHistorySnapshot(
            composeState.threads,
            composeState.threadOrder,
          )
          return runComposeAgent({
            model,
            modelSpec,
            messages,
            snapshot,
            historySnapshot,
            scope,
            xSearchOn,
            webSearch,
            xNewsOn,
            xNewsMaxAgeHours,
            newsBookmarks,
            signal: abortController.signal,
            onDraftHandoff: handoff ? startDraftWriter : undefined,
            forceDraftHandoff:
              handoff &&
              preferredFormat === 'article' &&
              looksLikeDraftIntent(userMessage),
            onWebSearch: ({ resultCount }) => {
              const s = useComposeStore.getState()
              s.pushAgentEvent({
                id: newAgentEventId(),
                label: 'Searched web',
                progressLabel: 'Searching web',
                detail: `${resultCount} result${resultCount === 1 ? '' : 's'}`,
                status: 'done',
                startedAt: Date.now(),
              })
              s.setAgentPhase(null)
              clearedToolActivity = false
              const stillRunning = useComposeStore
                .getState()
                .agentEvents.some((e) => e.status === 'running')
              if (!stillRunning) s.setAgentPhase('Thinking')
            },
            onDelta: (token) => {
              if (!clearedToolActivity) {
                clearedToolActivity = true
                useComposeStore.getState().setAgentPhase('Writing')
              }
              pendingDeltaRef.current += token
              scheduleDrip(threadId)
            },
            onContentReset: () => {
              flushPendingDelta(threadId)
              useComposeStore.getState().setLastAssistantContent(threadId, '')
              clearedToolActivity = false
            },
            onRoundStart: () => {
              eventByIndex.clear()
              useComposeStore.getState().setAgentPhase('Thinking')
            },
            onToolStart: ({ index, name }) => {
              flushPendingDelta(threadId)
              ensureToolEvent(index, name, {})
              useComposeStore.getState().setAgentPhase(null)
              clearedToolActivity = false
            },
            onTool: ({ index, name, args }) => {
              flushPendingDelta(threadId)
              const id = ensureToolEvent(index, name, args)
              pendingEventIds.set(`${name}:${JSON.stringify(args)}`, id)
              useComposeStore.getState().setAgentPhase(null)
              clearedToolActivity = false
            },
            onToolResult: async ({ name, args, result }) => {
              const s = useComposeStore.getState()
              const key = `${name}:${JSON.stringify(args)}`
              const id = pendingEventIds.get(key)
              pendingEventIds.delete(key)
              if (!id) return

              const status = isToolError(result) ? 'error' : 'done'
              const detail = describeToolResult(name, result)
              const startedAt =
                s.agentEvents.find((e) => e.id === id)?.startedAt ?? Date.now()
              const wait = Math.max(0, MIN_TOOL_DISPLAY_MS - (Date.now() - startedAt))
              if (wait > 0) {
                await new Promise<void>((resolve) => {
                  const t = setTimeout(resolve, wait)
                  abortController.signal.addEventListener(
                    'abort',
                    () => {
                      clearTimeout(t)
                      resolve()
                    },
                    { once: true },
                  )
                })
              }
              if (abortController.signal.aborted) return

              const after = useComposeStore.getState()
              after.updateAgentEvent(id, { status, detail })
              if (!after.agentEvents.some((e) => e.status === 'running')) {
                after.setAgentPhase('Thinking')
              }
            },
          })
        }

        let content: string
        try {
          ;({ content } = await runAgent(apiMessages))
        } catch (err) {
          if (!isContextOverflowError(err)) throw err
          // Payload still too large — force compress + one resend.
          apiMessages = await runCompressIfNeeded(apiMessages, { force: true })
          useComposeStore.getState().setAgentPhase('Thinking')
          ;({ content } = await runAgent(apiMessages))
        }

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
        const hint = isContextOverflowError(err)
          ? ' Context was still too large after compress — try a shorter message or lower the hot-window budget.'
          : ''
        useComposeStore.getState().setLastAssistantContent(threadId, `[Error: ${message}]${hint}`)
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
      scheduleDrip,
    ],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    const s = useComposeStore.getState()
    const threadId = s.activeThreadId
    if (threadId) flushPendingDelta(threadId)
    else {
      if (dripRafRef.current != null) {
        cancelAnimationFrame(dripRafRef.current)
        dripRafRef.current = null
      }
      pendingDeltaRef.current = ''
    }
    for (const e of s.agentEvents) {
      if (e.status === 'running') s.updateAgentEvent(e.id, { status: 'done' })
    }
    const finalEvents = useComposeStore.getState().agentEvents
    if (threadId && finalEvents.length > 0) {
      s.setLastAssistantAgentEvents(threadId, finalEvents)
    }
    s.setStreaming(false)
    s.setDraftWriterStreaming(false)
    s.setAgentPhase(null)
    s.clearAgentEvents()
  }, [setStreaming, flushPendingDelta])

  return { send, stop, isStreaming }
}
