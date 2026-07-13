import { describe, it, expect } from 'vitest'
import {
  conversationExportFilename,
  conversationToJson,
  conversationToMarkdown,
} from './export-conversation'
import type { Conversation } from '../../types/venice'

function sampleConversation(partial?: Partial<Conversation>): Conversation {
  return {
    id: 'c1',
    title: 'Sphere pulse',
    model: 'grok-4.5',
    createdAt: Date.parse('2026-07-13T12:00:00.000Z'),
    messages: [
      { role: 'user', content: 'What is trending?' },
      { role: 'assistant', content: 'DIEM cliff heat.' },
    ],
    ...partial,
  }
}

describe('conversationToMarkdown', () => {
  it('includes title, model, roles, and footer', () => {
    const md = conversationToMarkdown(sampleConversation())
    expect(md).toContain('# Sphere pulse')
    expect(md).toContain('grok-4.5')
    expect(md).toContain('## You')
    expect(md).toContain('What is trending?')
    expect(md).toContain('## Assistant')
    expect(md).toContain('DIEM cliff heat.')
    expect(md).toContain('IntelX Chat')
  })

  it('renders multimodal image parts as markdown images', () => {
    const md = conversationToMarkdown(
      sampleConversation({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'See this' },
              { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
            ],
          },
        ],
      }),
    )
    expect(md).toContain('See this')
    expect(md).toContain('![image](https://example.com/a.png)')
  })
})

describe('conversationToJson', () => {
  it('wraps conversation with envelope', () => {
    const conv = sampleConversation()
    const parsed = JSON.parse(conversationToJson(conv)) as {
      source: string
      version: number
      conversation: Conversation
    }
    expect(parsed.source).toBe('intelx-chat')
    expect(parsed.version).toBe(1)
    expect(parsed.conversation.id).toBe('c1')
    expect(parsed.conversation.messages).toHaveLength(2)
  })
})

describe('conversationExportFilename', () => {
  it('slugifies title and format', () => {
    expect(conversationExportFilename(sampleConversation())).toBe('sphere-pulse.md')
    expect(conversationExportFilename(sampleConversation(), 'json')).toBe('sphere-pulse.json')
    expect(conversationExportFilename(sampleConversation({ title: '!!!' }))).toBe(
      'conversation.md',
    )
  })
})
