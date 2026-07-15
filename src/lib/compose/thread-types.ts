import type { ChatMessage } from '../../types/venice'
import type { ComposeScope } from '../intel-library/types'
import type { AgentEvent } from './agent-events'
import type { PostDraft } from './types'
import type { PreferredFormat } from './format'

/** Chat message with optional per-turn agent step history (UI-only; stripped before API). */
export type ComposeMessage = ChatMessage & {
  agentEvents?: AgentEvent[]
  /**
   * Short UI label when `content` holds a long hidden prompt (e.g. template launches).
   * Shown in chat / rail preview; full `content` is what the model receives.
   */
  displayContent?: string
}

/** One compress pass — raw messages moved out of the live transcript for cold search. */
export interface CompressArchive {
  id: string
  createdAt: string
  summary: string
  messageCount: number
  messages: ComposeMessage[]
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
  /**
   * Preferred draft format for this thread; `auto` lets the model choose.
   * Per-thread and persisted so each conversation keeps its own choice.
   */
  preferredFormat?: PreferredFormat
  /** Starred threads pin to the top of history and cannot be deleted until unstarred. */
  starred?: boolean
  /**
   * Cold compress stacks (newest first). Live `messages` hold a summary marker
   * plus recent turns; full text of older turns lives here for history search.
   */
  compressArchives?: CompressArchive[]
}
