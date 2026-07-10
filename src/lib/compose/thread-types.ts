import type { ChatMessage } from '../../types/venice'
import type { ComposeScope } from '../intel-library/types'
import type { AgentEvent } from './agent-events'
import type { PostDraft } from './types'

/** Chat message with optional per-turn agent step history (UI-only; stripped before API). */
export type ComposeMessage = ChatMessage & {
  agentEvents?: AgentEvent[]
}

export interface ComposeThread {
  id: string
  context: ComposeScope
  title: string
  createdAt: string
  updatedAt: string
  messages: ComposeMessage[]
  draft: PostDraft
  tokenEstimate: number
  preview: string
}
