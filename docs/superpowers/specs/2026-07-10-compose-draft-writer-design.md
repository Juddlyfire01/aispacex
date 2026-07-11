# Compose Draft Writer Handoff Design

**Date:** 2026-07-10  
**Status:** Approved (Approach 1 — build)

## Goal

Main compose model (tool-capable, default Grok) researches and chats; when drafting is needed it calls `compose_write_draft` and a second **draft writer** model streams post copy into the draft drawer **in parallel** while the main model continues chatting.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Trigger | Only when drafting (via `compose_write_draft` tool) |
| Parallelism | Overlap — chat continues while drawer streams |
| Hybrid | Tool-only when `draftModel !== 'same'`; `'same'` = today’s single-model `postdraft` path |
| Writer list | All text models; pin Venice `default` trait + uncensored at top |
| Writer default | Live Venice `default` trait id |
| Architecture | `compose_write_draft` tool returns immediately; fire-and-forget writer stream |

## Data model

- `draftModel: 'same' | string` on compose store (persisted)
- Default on first load / empty: `resolveDefaultModelId` from models bundle (not hardcoded `1.2`)

## Flow (handoff mode)

1. Main agent tools = intel + history + `compose_write_draft`
2. Prompt: call tool with brief when user wants post copy; never emit `postdraft` yourself
3. Tool returns `{ status: 'started' }` immediately
4. Writer streams plain post text into draft drawer (register inject + brief); no tools
5. Main round continues streaming chat
6. Strip any leaked `postdraft` from main final content

## Flow (same as main)

Unchanged single-model path with `postdraft` blocks.
