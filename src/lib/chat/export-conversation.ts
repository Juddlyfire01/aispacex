import type { ChatMessage, Conversation } from '../../types/venice'
import { downloadText, slugifyFilename } from '../download-text'

export type ConversationExportFormat = 'md' | 'json'

function messageContentToMarkdown(m: ChatMessage): string {
  if (typeof m.content === 'string') return m.content
  if (m.content == null) return ''
  if (Array.isArray(m.content)) {
    return m.content
      .map((p) => {
        if (p.type === 'text') return p.text ?? ''
        if (p.type === 'image_url') return `![image](${p.image_url?.url ?? ''})`
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function roleHeading(role: ChatMessage['role']): string {
  if (role === 'user') return 'You'
  if (role === 'assistant') return 'Assistant'
  if (role === 'system') return 'System'
  return role
}

/** Human-readable Markdown dump of a main-chat conversation. */
export function conversationToMarkdown(conv: Conversation): string {
  const lines: string[] = [
    `# ${conv.title || 'Conversation'}`,
    '',
    `_Model: ${conv.model} · Created: ${new Date(conv.createdAt).toISOString()}_`,
    '',
  ]

  for (const m of conv.messages) {
    lines.push(`## ${roleHeading(m.role)}`, messageContentToMarkdown(m), '')
  }

  lines.push('---', '', '_Exported from Xintel Chat_')
  return lines.join('\n')
}

/**
 * Full-fidelity JSON for backup / future reimport.
 * Envelope matches compose/intel export style.
 */
export function conversationToJson(conv: Conversation): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      source: 'intelx-chat',
      version: 1,
      conversation: conv,
    },
    null,
    2,
  )
}

export function conversationExportFilename(
  conv: Conversation,
  format: ConversationExportFormat = 'md',
): string {
  const stem = slugifyFilename(conv.title || 'conversation', 'conversation')
  return format === 'json' ? `${stem}.json` : `${stem}.md`
}

export function downloadConversation(
  conv: Conversation,
  format: ConversationExportFormat,
): void {
  const content = format === 'json' ? conversationToJson(conv) : conversationToMarkdown(conv)
  const mime = format === 'json' ? 'application/json' : 'text/markdown'
  downloadText(content, conversationExportFilename(conv, format), mime)
}
