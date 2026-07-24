import { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useComposeStore } from '../stores/compose-store'
import { useComposePrefsStore } from '../stores/compose-prefs-store'
import {
  pauseEncryptedPersist,
  resumeEncryptedPersist,
  flushEncryptedStorage,
} from '../lib/encrypted-storage'
import { registerWipFlush } from '../lib/wip-guard'
import { useXSelfStore } from '../stores/x-self-store'
import { useXIntelStore } from '../stores/x-intel-store'
import { buildComposeSystem, buildHotUserPrefix } from '../lib/compose/compose-prompt'
import { buildSpentContentPack } from '../lib/compose/spent-content'
import { looksLikeDraftIntent } from '../lib/compose/article-handoff'
import { syncDraftForVerification } from '../lib/compose/verified-features'
import {
  completeDraftTarget,
  inferDraftTargetFromText,
} from '../lib/compose/open-compose'
import {
  isRegisterPackEmpty,
  packFromReportRegister,
  resolveRegisterPack,
} from '../lib/compose/register'
import { findReportKey } from '../stores/x-intel-store'
import {
  COMPOSE_WRITE_DRAFT_TOOL_NAME,
  DRAFT_WRITE_FORMATS,
  describeDraftWriteLabels,
  parseDraftWriteBrief,
  resolveDraftWriteFormat,
  resolveDraftWriterModelId,
  type DraftWriteBrief,
  type DraftWriteFormat,
} from '../lib/compose/draft-writer-tool'
import {
  runDraftWriter,
  splitWriterSegments,
  parseArticleFromWriterText,
  isToolCallShapedDraft,
  MIN_DRAFT_CHARS,
} from '../lib/compose/draft-writer'
import { emptyArticleDraft, emptySegment, type PostDraft } from '../lib/compose/types'
import type { PreferredFormat } from '../lib/compose/format'
import { getActiveAccountVerified } from './use-compose-verified'
import { buildIntelSnapshot } from '../lib/intel-library/from-stores'
import { packHotWindowCached } from '../lib/compose/hot-window'
import { mergeHotWithNewsBookmarks } from '../lib/compose/news-hot'
import { mergeHotWithAlpha } from '../lib/compose/alpha-hot'
import { useNewsStore } from '../stores/news-store'
import { useAlphaStore } from '../stores/alpha-store'
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
import { yieldForPaint } from '../lib/yield-for-paint'
import { assertPaidReady, PaidNotReadyError } from '../lib/x402/charge-flow'

// Compose chat via streaming intel agent: packs a hot-window of local library
// data, may call intel_* / compose_history_* / compose_write_draft tools (tool
// rounds stream activity; compose_write_draft always starts a separate draft
// stage that continues the agent transcript into the Draft drawer).

export function useCompose() {
  const abortRef = useRef<AbortController | null>(null)
  /**
   * Separate from research abort — research turn completion must not kill the
   * draft writer mid-stream (that produced truncated "load" / "s" drafts).
   */
  const draftWriterAbortRef = useRef<AbortController | null>(null)
  /** Live timeline event id for the in-flight writer (survives research teardown). */
  const draftWriterEventIdRef = useRef<string | null>(null)
  /** SSE tokens wait here; dripped to the store for a rapid-typing feel. */
  const pendingDeltaRef = useRef('')
  const dripRafRef = useRef<number | null>(null)
  /** Active stream thread — pagehide flush needs this without waiting for stop. */
  const activeStreamThreadRef = useRef<string | null>(null)
  /**
   * Draft-writer drip lives on the send closure; pagehide needs a shared flush.
   * Set while a writer is streaming; cleared when it finishes.
   */
  const draftWriterFlushRef = useRef<(() => void) | null>(null)
  const queryClient = useQueryClient()
  // Narrow selector: bare useComposeStore() re-renders on every token.
  const isStreaming = useComposeStore((s) => s.isStreaming)

  /** Push the whole buffer now (tool boundaries, finalize, stop, pagehide). */
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

  /** Pin live agent timeline + drip buffers so refresh keeps WIP. */
  const settleWip = useCallback(() => {
    const s = useComposeStore.getState()
    const threadId = activeStreamThreadRef.current ?? s.activeThreadId
    if (threadId) flushPendingDelta(threadId)
    draftWriterFlushRef.current?.()
    const writerEventId = draftWriterEventIdRef.current
    for (const e of s.agentEvents) {
      // Leave the draft writer event running — it owns its own lifecycle.
      if (e.status === 'running' && e.id !== writerEventId) {
        s.updateAgentEvent(e.id, { status: 'done' })
      }
    }
    const finalEvents = useComposeStore.getState().agentEvents
    if (threadId && finalEvents.length > 0) {
      s.setLastAssistantAgentEvents(threadId, finalEvents)
    }
  }, [flushPendingDelta])

  useEffect(() => registerWipFlush(settleWip), [settleWip])

  /** Reveal pending tokens in larger chunks — fewer store updates = less jank. */
  const scheduleDrip = useCallback((threadId: string) => {
    if (dripRafRef.current != null) return

    const tick = () => {
      dripRafRef.current = null
      const pending = pendingDeltaRef.current
      if (!pending) return

      const backlog = pending.length
      // Larger base chunks than before (~12 chars/frame) to cut re-renders in half+.
      let n: number
      if (backlog > 160) n = Math.ceil(backlog * 0.35)
      else if (backlog > 64) n = 28
      else if (backlog > 24) n = 16
      else n = Math.min(12, backlog)

      // Prefer ending on whitespace so chunks feel word-ish, not mid-glyph.
      let take = n
      if (backlog > n) {
        const window = pending.slice(0, n + 12)
        const sp = window.lastIndexOf(' ')
        const nl = window.lastIndexOf('\n')
        const breakAt = Math.max(sp, nl)
        if (breakAt >= Math.floor(n * 0.4)) take = breakAt + 1
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
    async (
      userMessage: string,
      opts?: {
        /**
         * Short label shown in the chat UI when `userMessage` is a long hidden
         * prompt (e.g. template launches). Model still receives `userMessage`.
         */
        displayContent?: string
      },
    ): Promise<void> => {
      const store = useComposeStore.getState()
      const threadId = store.ensureActiveThread()
      const thread = useComposeStore.getState().threads[threadId]
      if (!thread) return

      // Credits must be fully signed in (or Free/BYOK allowed) before any work.
      try {
        assertPaidReady()
      } catch (err) {
        if (err instanceof PaidNotReadyError) return
        throw err
      }

      // Skip encrypt+IDB so early store writes don't kick off a disk write.
      // Stagger paints: busy chrome now → user bubble @20ms → Thinking @40ms.
      pauseEncryptedPersist()
      flushSync(() => {
        const s = useComposeStore.getState()
        s.setStreaming(true)
        s.clearAgentEvents()
        s.setAgentPhase(null)
      })
      pendingDeltaRef.current = ''
      if (dripRafRef.current != null) {
        cancelAnimationFrame(dripRafRef.current)
        dripRafRef.current = null
      }
      activeStreamThreadRef.current = threadId

      // New research turn: cancel a leftover writer from a prior send.
      draftWriterAbortRef.current?.abort()
      draftWriterAbortRef.current = null
      draftWriterEventIdRef.current = null

      const abortController = new AbortController()
      abortRef.current = abortController
      let clearedToolActivity = false
      /** One-shot: open the draft drawer optimistically the moment the writer
       * tool name appears in the SSE stream, so the pane stops looking empty
       * while the brief args + writer request are still in flight. */
      let draftSkeletonShown = false
      /** Stream index → timeline event id (set on onToolStart, reused on execute). */
      const eventByIndex = new Map<number, string>()
      /** name+args → event id for onToolResult matching. */
      const pendingEventIds = new Map<string, string>()
      const MIN_TOOL_DISPLAY_MS = 1000

      try {
        await new Promise<void>((r) => setTimeout(r, 20))
        if (abortController.signal.aborted) return

        flushSync(() => {
          useComposeStore.getState().addMessage(threadId, {
            role: 'user',
            content: userMessage,
            ...(opts?.displayContent?.trim()
              ? { displayContent: opts.displayContent.trim() }
              : {}),
          })
          useComposeStore.getState().addMessage(threadId, { role: 'assistant', content: '' })
        })
        await yieldForPaint()

        await new Promise<void>((r) => setTimeout(r, 20))
        if (abortController.signal.aborted) return

        flushSync(() => {
          useComposeStore.getState().setAgentPhase('Thinking')
        })
        // Let Thinking paint before sync packing work.
        await yieldForPaint()

        const store = useComposeStore.getState()
        const selfAccounts = Object.values(useXSelfStore.getState().accounts)
        const reports = Object.values(useXIntelStore.getState().reports)
        const snapshot = buildIntelSnapshot({ selfAccounts, reports })
        const scope = useComposeStore.getState().threads[threadId]?.context ?? thread.context
        const composeState = useComposeStore.getState()
        const historySnapshot = buildHistorySnapshot(composeState.threads, composeState.threadOrder)
        const liveDraft = composeState.threads[threadId]?.draft
        const currentDraftText = liveDraft
          ? [
              ...(liveDraft.segments ?? []).map((s) => s.text.trim()).filter(Boolean),
              liveDraft.article
                ? [liveDraft.article.title, liveDraft.article.bodyMarkdown]
                    .map((s) => s?.trim())
                    .filter(Boolean)
                    .join('\n\n')
                : '',
            ]
              .filter(Boolean)
              .join('\n---\n')
          : ''
        const spentPack = buildSpentContentPack({
          snapshot,
          history: historySnapshot,
          currentDraftText: currentDraftText || null,
        })
        const spentText = spentPack.text

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
        } = useComposePrefsStore.getState()
        const { contextLimit } = useComposeStore.getState()
        // preferredFormat is per-thread now; default auto when unset.
        const preferredFormat =
          useComposeStore.getState().threads[threadId]?.preferredFormat ?? 'auto'
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
        const { text: withNews } = mergeHotWithNewsBookmarks(pack.text, newsBookmarks)
        useAlphaStore.getState().pruneCold()
        const { text: hotText } = mergeHotWithAlpha(withNews, {
          briefs: useAlphaStore.getState().briefs,
          stories: useAlphaStore.getState().stories,
          posts: useAlphaStore.getState().posts,
        })

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

        const writerModelId = resolveDraftWriterModelId(draftModel, model)
        const system = buildComposeSystem({
          modelId: model,
          xSearchOn,
          webSearchOn: webSearch !== 'off',
          xNewsOn,
          toolsEnabled: true,
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
            // displayContent is UI-only (template labels); never send it to the model.
            const { agentEvents: _ae, displayContent: _dc, ...rest } = m
            if (i === history.length - 1 && rest.role === 'user' && typeof rest.content === 'string') {
              return { ...rest, content: buildHotUserPrefix(hotText, userMessage, spentText) }
            }
            return rest
          })
          return [{ role: 'system', content: system }, ...apiHistory]
        }

        const modelsCache = queryClient.getQueryData<ModelsQueryResult>(['models', 'text'])
        const modelSpec = modelsCache?.models.find((m) => m.id === model) ?? null
        const draftModelSpec =
          modelsCache?.models.find((m) => m.id === writerModelId) ?? null

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

        type DraftStreamSession = {
          onDelta: (token: string) => void
          flush: () => void
          finishFromText: (text: string) => void
          finishError: (err: unknown) => void
        }

        /** Append a visible error to the chat when the fire-and-forget writer fails. */
        const reportDraftWriterError = (message: string) => {
          const s = useComposeStore.getState()
          const current = s.threads[threadId]?.messages ?? []
          const lastAssistant = [...current].reverse().find((m) => m.role === 'assistant')
          const suffix = `\n\n[Draft writer error: ${message}]`
          if (lastAssistant) {
            const existing = typeof lastAssistant.content === 'string' ? lastAssistant.content : ''
            s.setLastAssistantContent(threadId, existing + suffix)
          } else {
            s.addMessage(threadId, { role: 'assistant', content: suffix.trim() })
          }
        }

        let draftStreamSession: DraftStreamSession | null = null

        const createDraftStreamSession = (
          brief: DraftWriteBrief,
          opts?: { showWriterEvent?: boolean },
        ): DraftStreamSession => {
          const sendPref =
            brief.preferredFormat ??
            useComposeStore.getState().threads[threadId]?.preferredFormat ??
            preferredFormat
          const resolvedFormat = resolveDraftWriteFormat(
            sendPref,
            brief.format,
            brief.longform,
          )
          // Under Auto, resolve for this write only — do not lock the thread pill.
          // User overrides (post/thread/…) persist; model choices stay ephemeral.
          const writerBrief: DraftWriteBrief = {
            ...brief,
            preferredFormat: resolvedFormat,
            format: resolvedFormat,
            ...(resolvedFormat === 'article'
              ? { longform: false }
              : resolvedFormat === 'longform'
                ? { longform: true }
                : {}),
          }
          const sendWantsArticle = resolvedFormat === 'article'
          const s0 = useComposeStore.getState()
          useComposePrefsStore.getState().setDraftDrawerOpen(true)
          s0.setDraftWriterStreaming(true)

          let resolvedTarget = writerBrief.target
            ? completeDraftTarget(writerBrief.target)
            : undefined
          if (!resolvedTarget && !sendWantsArticle) {
            const recent = (s0.threads[threadId]?.messages ?? [])
              .slice(-10)
              .map((m) => (typeof m.content === 'string' ? m.content : ''))
              .join('\n')
            const hint = [writerBrief.intent ?? '', recent].join('\n')
            resolvedTarget = inferDraftTargetFromText(hint)
          }

          const seg = emptySegment()
          s0.applyDraftPatch(threadId, {
            segments: [seg],
            ...(resolvedTarget && !sendWantsArticle ? { target: resolvedTarget } : {}),
            ...(sendWantsArticle
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
          let writerEventId: string | null = null
          if (opts?.showWriterEvent) {
            const writerLabels = describeDraftWriteLabels({
              article: sendWantsArticle,
            })
            writerEventId = newAgentEventId()
            draftWriterEventIdRef.current = writerEventId
            useComposeStore.getState().pushAgentEvent({
              id: writerEventId,
              label: writerLabels.label,
              progressLabel: sendWantsArticle
                ? `Article writer streaming (${writerModelId})`
                : `Draft writer streaming (${writerModelId})`,
              status: 'running',
              startedAt: Date.now(),
            })
          }

          const livePrefFormat = (): PreferredFormat =>
            useComposeStore.getState().threads[threadId]?.preferredFormat ?? resolvedFormat

          const liveWantsArticle = (): boolean => {
            const live = livePrefFormat()
            if (live === 'article') return true
            if (live === 'auto') return resolvedFormat === 'article'
            return false
          }

          const applyDisplayed = (text: string) => {
            if (liveWantsArticle()) {
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
            useComposeStore.getState().patchSegmentsStream(threadId, stable)
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
              if (backlog > 160) n = Math.ceil(backlog * 0.35)
              else if (backlog > 64) n = 28
              else if (backlog > 24) n = 16
              else n = Math.min(12, backlog)

              let take = n
              if (backlog > n) {
                const window = pending.slice(0, n + 12)
                const sp = window.lastIndexOf(' ')
                const nl = window.lastIndexOf('\n')
                const breakAt = Math.max(sp, nl)
                if (breakAt >= Math.floor(n * 0.4)) take = breakAt + 1
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
            draftWriterFlushRef.current = null
            const eventId = writerEventId ?? draftWriterEventIdRef.current
            if (eventId && draftWriterEventIdRef.current === eventId) {
              draftWriterEventIdRef.current = null
            }
            useComposeStore.getState().setDraftWriterStreaming(false)
            // Research turn may already have finished; release pagehide anchor.
            const researchDone = !abortRef.current
            if (eventId) {
              const patch = {
                status: (status === 'cancelled' ? 'done' : status) as 'done' | 'error',
                detail,
              }
              const store = useComposeStore.getState()
              store.updateAgentEvent(eventId, patch)
              // Research teardown may have cleared live events and pinned them
              // onto the assistant message — patch that copy too.
              const msgs = store.threads[threadId]?.messages ?? []
              const last = msgs[msgs.length - 1]
              if (last?.role === 'assistant' && last.agentEvents?.some((e) => e.id === eventId)) {
                store.setLastAssistantAgentEvents(
                  threadId,
                  last.agentEvents.map((e) => (e.id === eventId ? { ...e, ...patch } : e)),
                )
              } else if (researchDone) {
                // Writer finished after research pinned a snapshot without this
                // event yet — merge into the message timeline.
                const pinned = last?.role === 'assistant' ? (last.agentEvents ?? []) : []
                const live = store.agentEvents
                const merged = (pinned.length ? pinned : live).map((e) =>
                  e.id === eventId ? { ...e, ...patch } : e,
                )
                if (merged.some((e) => e.id === eventId) && last?.role === 'assistant') {
                  store.setLastAssistantAgentEvents(threadId, merged)
                }
              }
            }
            if (researchDone) {
              activeStreamThreadRef.current = null
              useComposeStore.getState().clearAgentEvents()
            }
          }

          draftWriterFlushRef.current = flushDraftDrip

          const clearBadDraft = () => {
            useComposeStore.getState().applyDraftPatch(threadId, {
              segments: [emptySegment()],
              ...(sendWantsArticle ? { article: emptyArticleDraft() } : { article: undefined }),
            })
          }

          const finalizeText = (text: string) => {
            flushDraftDrip()
            const trimmed = text.trim()
            if (!trimmed) {
              const detail = `${writerModelId} returned empty content`
              clearBadDraft()
              finishWriter('error', detail)
              reportDraftWriterError(detail)
              return
            }
            if (isToolCallShapedDraft(trimmed)) {
              const detail = `${writerModelId} echoed a tool call / brief JSON instead of post copy`
              clearBadDraft()
              finishWriter('error', detail)
              reportDraftWriterError(detail)
              return
            }
            if (trimmed.length < MIN_DRAFT_CHARS) {
              const detail = `${writerModelId} returned only ${trimmed.length} chars — likely truncated`
              clearBadDraft()
              finishWriter('error', detail)
              reportDraftWriterError(detail)
              return
            }
            const store = useComposeStore.getState()
            const pref = livePrefFormat()
            const wantsArticle =
              pref === 'article' || (pref === 'auto' && resolvedFormat === 'article')
            const allowArticleHeuristic = pref === 'auto' || pref === 'article'
            const looksLikeArticle =
              allowArticleHeuristic && /^#\s+\S/.test(trimmed)
            if (wantsArticle || looksLikeArticle) {
              const parsed = parseArticleFromWriterText(trimmed)
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
            const texts = splitWriterSegments(trimmed)
            const segments =
              texts.length > 0
                ? texts.map((segText, i) => ({
                    id: i === 0 ? seg.id : `dw_${i}_${seg.id}`,
                    text: segText,
                    media: [],
                  }))
                : [{ ...seg, text: trimmed }]
            const isVerified = getActiveAccountVerified()
            const longformPref = useComposePrefsStore.getState().longformPreference
            const patch: Partial<PostDraft> = {
              segments,
              article: undefined,
              ...(writerBrief.target ? { target: writerBrief.target } : {}),
              ...(typeof writerBrief.longform === 'boolean'
                ? { longform: writerBrief.longform }
                : {}),
            }
            const gated = syncDraftForVerification(
              { ...store.threads[threadId]!.draft, ...patch },
              isVerified,
              longformPref,
            )
            store.applyDraftPatch(threadId, gated ? { ...patch, ...gated } : patch)
            finishWriter(
              'done',
              texts.length > 1 ? `${texts.length} segments` : 'ready',
            )
          }

          return {
            onDelta: (token: string) => {
              networkAcc += token
              pendingDraft += token
              scheduleDraftDrip()
            },
            flush: flushDraftDrip,
            finishFromText: (text: string) => {
              finalizeText(text || networkAcc)
            },
            finishError: (err: unknown) => {
              if (err instanceof DOMException && err.name === 'AbortError') {
                finishWriter('cancelled', 'cancelled')
                return
              }
              clearBadDraft()
              const message = err instanceof Error ? err.message : 'Draft writer failed'
              finishWriter('error', message)
              reportDraftWriterError(message)
            },
          }
        }

        const startDraftWriter = (
          brief: DraftWriteBrief,
          agentMessages: ChatMessage[],
        ) => {
          const session = createDraftStreamSession(brief, { showWriterEvent: true })
          draftStreamSession = session
          const sendPref =
            brief.preferredFormat ??
            useComposeStore.getState().threads[threadId]?.preferredFormat ??
            preferredFormat
          const resolvedFormat = resolveDraftWriteFormat(
            sendPref,
            brief.format,
            brief.longform,
          )
          const writerBrief: DraftWriteBrief = {
            ...brief,
            preferredFormat: resolvedFormat,
            format: resolvedFormat,
            ...(resolvedFormat === 'article'
              ? { longform: false }
              : resolvedFormat === 'longform'
                ? { longform: true }
                : {}),
          }

          // Own abort signal — research turn end must not truncate the writer.
          draftWriterAbortRef.current?.abort()
          const writerAbort = new AbortController()
          draftWriterAbortRef.current = writerAbort

          void runDraftWriter({
            modelId: writerModelId,
            modelSpec: draftModelSpec,
            brief: writerBrief,
            messages: agentMessages,
            registerInject: registerResolved.inject,
            signal: writerAbort.signal,
            onDelta: session.onDelta,
          })
            .then((finalText) => session.finishFromText(finalText))
            .catch((err) => session.finishError(err))
            .finally(() => {
              if (draftWriterAbortRef.current === writerAbort) {
                draftWriterAbortRef.current = null
              }
            })
        }

        const ensureToolEvent = (
          index: number,
          name: string,
          args: Record<string, unknown>,
        ): string => {
          const existing = eventByIndex.get(index)
          const draftLabels =
            name === 'compose_write_draft'
              ? describeDraftWriteLabels({
                  article:
                    resolveDraftWriteFormat(
                      preferredFormat,
                      typeof args.format === 'string' &&
                        (DRAFT_WRITE_FORMATS as string[]).includes(args.format)
                        ? (args.format as DraftWriteFormat)
                        : undefined,
                      typeof args.longform === 'boolean' ? args.longform : undefined,
                    ) === 'article',
                })
              : null
          const label = draftLabels?.label ?? describeToolCall(name, args)
          const progressLabel = draftLabels?.progressLabel ?? describeToolProgress(name, args)
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
            onDraftHandoff: startDraftWriter,
            forceDraftHandoff:
              preferredFormat === 'article' && looksLikeDraftIntent(userMessage),
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
              // Optimistic drawer: as soon as the writer tool name is seen (args
              // + the second /chat/completions request still pending), open the
              // pane and flip on the "Writing…" affordance so it isn't blank.
              if (
                !draftSkeletonShown &&
                name === COMPOSE_WRITE_DRAFT_TOOL_NAME
              ) {
                draftSkeletonShown = true
                const s = useComposeStore.getState()
                useComposePrefsStore.getState().setDraftDrawerOpen(true)
                s.setDraftWriterStreaming(true)
                if (preferredFormat === 'article') {
                  const existing = s.threads[threadId]?.draft.article
                  if (!existing || (!existing.title.trim() && !existing.bodyMarkdown.trim())) {
                    s.applyDraftPatch(threadId, {
                      article: emptyArticleDraft(),
                      longform: false,
                      target: { kind: 'original' },
                    })
                  }
                } else {
                  // Clear post body so the Writing… state is visible in the gap
                  // before the draft stage streams the first token.
                  const draft = s.threads[threadId]?.draft
                  const hasBody = draft?.segments.some((seg) => seg.text.trim())
                  if (hasBody) {
                    s.applyDraftPatch(threadId, { segments: [emptySegment()] })
                  }
                }
              }
            },
            onTool: ({ index, name, args }) => {
              flushPendingDelta(threadId)
              const id = ensureToolEvent(index, name, args)
              pendingEventIds.set(`${name}:${JSON.stringify(args)}`, id)
              useComposeStore.getState().setAgentPhase(null)
              clearedToolActivity = false
              // Apply quote/reply target as soon as tool args arrive (before the
              // draft-stage request), so TargetPicker isn't stuck on Original.
              if (name === COMPOSE_WRITE_DRAFT_TOOL_NAME) {
                const brief = parseDraftWriteBrief(args)
                if (brief.target && brief.format !== 'article') {
                  useComposeStore.getState().applyDraftPatch(threadId, {
                    target: completeDraftTarget(brief.target),
                  })
                }
              }
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

        // Chat status only — draft copy always comes from the draft stage.
        const finishedStore = useComposeStore.getState()
        if (content) {
          finishedStore.setLastAssistantContent(threadId, content)
        }
      } catch (err) {
        flushPendingDelta(threadId)
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Toast already shown by assertPaidReady — don't dump into the transcript.
        if (err instanceof PaidNotReadyError) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        const hint = isContextOverflowError(err)
          ? ' Context was still too large after compress — try a shorter message or lower the hot-window budget.'
          : ''
        useComposeStore.getState().setLastAssistantContent(threadId, `[Error: ${message}]${hint}`)
      } finally {
        flushPendingDelta(threadId)
        draftWriterFlushRef.current?.()
        // If we optimistically flipped on the writer skeleton but the writer
        // never actually started (empty brief, or the run ended first), clear
        // the streaming flag so the drawer doesn't get stuck in "Writing…".
        if (draftSkeletonShown && !draftWriterFlushRef.current) {
          useComposeStore.getState().setDraftWriterStreaming(false)
        }
        const s = useComposeStore.getState()
        const writerEventId = draftWriterEventIdRef.current
        const writerStillRunning = Boolean(draftWriterFlushRef.current && writerEventId)
        // Settle interrupted research steps; leave the draft writer event alone.
        for (const e of s.agentEvents) {
          if (e.status === 'running' && e.id !== writerEventId) {
            s.updateAgentEvent(e.id, { status: 'done' })
          }
        }
        const finalEvents = useComposeStore.getState().agentEvents
        if (finalEvents.length > 0) {
          s.setLastAssistantAgentEvents(threadId, finalEvents)
        }
        s.setStreaming(false)
        s.setAgentPhase(null)
        // Keep the writer event in live strip until it finishes; otherwise clear.
        if (writerStillRunning && writerEventId) {
          const writerEv = useComposeStore.getState().agentEvents.find((e) => e.id === writerEventId)
          s.clearAgentEvents()
          if (writerEv) s.pushAgentEvent(writerEv)
        } else {
          s.clearAgentEvents()
        }
        abortRef.current = null
        // Keep activeStreamThreadRef while writer streams so pagehide can flush.
        if (!writerStillRunning) {
          activeStreamThreadRef.current = null
        }
        // Resume encrypt+IDB and force the settled snapshot to disk.
        resumeEncryptedPersist()
        void flushEncryptedStorage('venice-compose')
      }
    },
    // store actions read via getState; only stable helpers in deps
    [queryClient, flushPendingDelta, scheduleDrip],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    draftWriterAbortRef.current?.abort()
    draftWriterAbortRef.current = null
    draftWriterEventIdRef.current = null
    settleWip()
    const s = useComposeStore.getState()
    s.setStreaming(false)
    s.setDraftWriterStreaming(false)
    s.setAgentPhase(null)
    s.clearAgentEvents()
    activeStreamThreadRef.current = null
    resumeEncryptedPersist()
    void flushEncryptedStorage('venice-compose')
  }, [settleWip])

  return { send, stop, isStreaming }
}
