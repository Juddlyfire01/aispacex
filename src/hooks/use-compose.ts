import { useCallback, useRef } from 'react'
import { venice } from '../lib/venice-client'
import { parseSSEStream } from '../lib/stream'
import { useComposeStore } from '../stores/compose-store'
import { buildComposeSystem, type TargetContext } from '../lib/compose/compose-prompt'
import { parseDraftBlock } from '../lib/compose/draft-block'
import { syncDraftForVerification, applyLongformPreference } from '../lib/compose/verified-features'
import { getActiveAccountVerified } from './use-compose-verified'
import type { ChatCompletionRequest, ChatMessage } from '../types/venice'

// Streaming compose chat. Mirrors use-chat's abort/stream pattern, but on stream
// completion it extracts the ```postdraft block from the assistant's reply,
// applies it to the session's PostDraft, and rewrites the message to the clean
// prose (block stripped) so the transcript stays readable.

export function useCompose() {
  const abortRef = useRef<AbortController | null>(null)
  const {
    activeContext,
    model,
    xSearch,
    isStreaming,
    ensureSession,
    addMessage,
    appendToLastAssistant,
    setLastAssistantContent,
    applyDraftPatch,
    setStreaming,
  } = useComposeStore()

  const send = useCallback(
    async (userMessage: string, targetContext?: TargetContext, corpus?: string) => {
      const context = activeContext
      ensureSession(context)

      addMessage(context, { role: 'user', content: userMessage })
      addMessage(context, { role: 'assistant', content: '' })
      setStreaming(true)

      const abortController = new AbortController()
      abortRef.current = abortController

      const xSearchOn = xSearch !== 'off'
      const system = buildComposeSystem({ target: targetContext, corpus, xSearchOn })

      // Transcript minus the trailing empty assistant placeholder.
      const session = useComposeStore.getState().sessions[context]
      const history = (session?.messages ?? []).filter((m) =>
        typeof m.content === 'string' ? m.content !== '' : true,
      )
      const messages: ChatMessage[] = [{ role: 'system', content: system }, ...history]

      const body: ChatCompletionRequest = {
        model,
        messages,
        stream: true,
        temperature: 0.6,
        venice_parameters: { enable_x_search: xSearchOn },
      }

      try {
        const stream = await venice<ReadableStream<Uint8Array>>('/chat/completions', {
          method: 'POST',
          body: JSON.stringify(body),
          stream: true,
          signal: abortController.signal,
        })

        for await (const chunk of parseSSEStream(stream, { signal: abortController.signal })) {
          const delta = chunk.choices[0]?.delta
          if (delta?.content) appendToLastAssistant(context, delta.content)
        }

        // Stream finished — pull any structured draft out of the final message.
        const finished = useComposeStore.getState().sessions[context]
        const last = finished?.messages[finished.messages.length - 1]
        if (last?.role === 'assistant' && typeof last.content === 'string') {
          const { draft, visibleText } = parseDraftBlock(last.content)
          if (draft) {
            const isVerified = getActiveAccountVerified()
            const pref = useComposeStore.getState().longformPreference
            const withPref = applyLongformPreference(draft, pref)
            const gated = syncDraftForVerification(withPref, isVerified, pref)
            applyDraftPatch(context, gated ? { ...withPref, ...gated } : withPref)
            setLastAssistantContent(context, visibleText || 'Draft updated.')
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        appendToLastAssistant(context, `\n\n[Error: ${message}]`)
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [activeContext, model, xSearch, ensureSession, addMessage, appendToLastAssistant, setLastAssistantContent, applyDraftPatch, setStreaming],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
  }, [setStreaming])

  return { send, stop, isStreaming }
}
