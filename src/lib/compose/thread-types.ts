import type { ChatMessage } from '../../types/venice'
import type { ComposeScope } from '../intel-library/types'
import type { PostDraft } from './types'

export interface ComposeThread {
  id: string
  context: ComposeScope
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
  draft: PostDraft
  tokenEstimate: number
  preview: string
}
