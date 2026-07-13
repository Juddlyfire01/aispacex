import { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { venice } from '../lib/venice-client'
import { parseSSEStream } from '../lib/stream'
import { useChatStore } from '../stores/chat-store'
import type { ChatCompletionRequest, ChatMessage, ContentPart } from '../types/venice'
import { yieldForPaint } from '../lib/yield-for-paint'
import {
  pauseEncryptedPersist,
  resumeEncryptedPersist,
  flushEncryptedStorage,
} from '../lib/encrypted-storage'
import { registerWipFlush } from '../lib/wip-guard'

export function useChat() {
  const abortRef = useRef<AbortController | null>(null)
  // Narrow: bare useChatStore() re-rendered the whole chat tree on every token.
  const isStreaming = useChatStore((s) => s.isStreaming)

  useEffect(
    () =>
      registerWipFlush(() => {
        // Chat writes tokens straight to the store; just ensure disk flush later.
      }),
    [],
  )

  const streamResponse = useCallback(
    async (convId: string, model: string, abortController: AbortController) => {
      const state = useChatStore.getState()
      const conv = state.conversations.find((c) => c.id === convId)
      if (!conv) return

      const { systemPrompt, temperature, topP, maxTokens, veniceParams } = state
      const messages = conv.messages.filter((m) => {
        if (typeof m.content === 'string') return m.content !== ''
        return true
      })
      if (systemPrompt.trim()) {
        messages.unshift({ role: 'system', content: systemPrompt.trim() })
      }

      const body: ChatCompletionRequest = {
        model,
        messages,
        stream: true,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        venice_parameters: veniceParams,
      }

      const stream = await venice<ReadableStream<Uint8Array>>('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body),
        stream: true,
        signal: abortController.signal,
      })

      for await (const chunk of parseSSEStream(stream, { signal: abortController.signal })) {
        const delta = chunk.choices[0]?.delta
        if (delta?.content) {
          useChatStore.getState().appendToLastAssistant(convId, delta.content)
        }
        if (delta?.reasoning_content) {
          useChatStore.getState().appendReasoningToLastAssistant(convId, delta.reasoning_content)
        }
      }
    },
    [],
  )

  const send = useCallback(
    async (userMessage: string, model: string, imageAttachments?: string[]) => {
      const store = useChatStore.getState()
      let convId = store.activeConversationId
      if (!convId) {
        convId = store.createConversation(model)
      }

      // Build user message — plain text or multimodal with images
      let userMsg: ChatMessage
      if (imageAttachments && imageAttachments.length > 0) {
        const parts: ContentPart[] = [
          { type: 'text', text: userMessage },
          ...imageAttachments.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ]
        userMsg = { role: 'user', content: parts }
      } else {
        userMsg = { role: 'user', content: userMessage }
      }

      flushSync(() => {
        useChatStore.getState().setStreaming(true)
      })
      await yieldForPaint()

      useChatStore.getState().addMessage(convId, userMsg)
      useChatStore.getState().addMessage(convId, { role: 'assistant', content: '' })
      pauseEncryptedPersist()

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        await streamResponse(convId, model, abortController)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        useChatStore.getState().appendToLastAssistant(convId!, `\n\n[Error: ${message}]`)
      } finally {
        useChatStore.getState().setStreaming(false)
        abortRef.current = null
        resumeEncryptedPersist()
        void flushEncryptedStorage('venice-chat')
      }
    },
    [streamResponse],
  )

  const regenerate = useCallback(
    async (model: string) => {
      const store = useChatStore.getState()
      const convId = store.activeConversationId
      if (!convId) return
      const conv = store.conversations.find((c) => c.id === convId)
      if (!conv) return

      const lastAssistantIdx = conv.messages.length - 1
      if (conv.messages[lastAssistantIdx]?.role === 'assistant') {
        store.deleteMessage(convId, lastAssistantIdx)
      }

      flushSync(() => {
        useChatStore.getState().setStreaming(true)
      })
      await yieldForPaint()

      useChatStore.getState().addMessage(convId, { role: 'assistant', content: '' })
      pauseEncryptedPersist()

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        await streamResponse(convId, model, abortController)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        useChatStore.getState().appendToLastAssistant(convId, `\n\n[Error: ${message}]`)
      } finally {
        useChatStore.getState().setStreaming(false)
        abortRef.current = null
        resumeEncryptedPersist()
        void flushEncryptedStorage('venice-chat')
      }
    },
    [streamResponse],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    useChatStore.getState().setStreaming(false)
    resumeEncryptedPersist()
    void flushEncryptedStorage('venice-chat')
  }, [])

  return { send, stop, regenerate, isStreaming }
}
