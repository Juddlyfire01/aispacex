import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from './chat-store'

function reset() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    isStreaming: false,
  })
}

describe('chat-store starring', () => {
  beforeEach(reset)

  it('toggleStarConversation pins starred to top', () => {
    const a = useChatStore.getState().createConversation('m1')
    const b = useChatStore.getState().createConversation('m1')
    // b is newest first
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([b, a])

    useChatStore.getState().toggleStarConversation(a)
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([a, b])
    expect(useChatStore.getState().conversations[0]?.starred).toBe(true)
  })

  it('deleteConversation refuses starred chats', () => {
    const id = useChatStore.getState().createConversation('m1')
    useChatStore.getState().toggleStarConversation(id)
    useChatStore.getState().deleteConversation(id)
    expect(useChatStore.getState().conversations.find((c) => c.id === id)).toBeDefined()

    useChatStore.getState().toggleStarConversation(id)
    useChatStore.getState().deleteConversation(id)
    expect(useChatStore.getState().conversations.find((c) => c.id === id)).toBeUndefined()
  })
})
