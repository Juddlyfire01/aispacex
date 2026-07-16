# Alpha Radar — Design

**Date:** 2026-07-15  
**Status:** Implemented (Radar rebuild)

## Product

Post sub-tabs: **Composer | Alpha | Performance**.

- `PostSubTab = 'composer' | 'alpha' | 'performance'`
- News sidebar tab remains external RSS (unchanged).
- **Alpha is not Signal.** Signal owns VeniceStats buzz/pulse. Alpha owns live X + Grok X search.

## What Alpha is

Reverse-engineered **X Radar** surface using tools we actually have:

| Layer | Source | Role |
|-------|--------|------|
| **Grok X brief** | Venice chat + `enable_x_search` | Highest signal: live X-native analysis of rails |
| **X News** | `news/search` multi-query scan | Grok-clustered stories on X |
| **Volume rails** | `tweets/counts/recent` | Volume + 1h/24h velocity + sparklines |
| **Live posts** | `tweets/search/recent` | Firehose on rail expand |
| **Local Intel heat** | Already-gathered posts | Free, collapsible, not the hero |

## Cost model

- App covers X + Venice spend until funding.
- Content ordered ambient → highest signal (counts → news → posts → Grok brief is explicit action).
- Operator meter: `alpha-store` session/lifetime cost.

## Rails

- System pack: Venice sphere, Uncensored/local AI, AI agents, Grok/xAI.
- User-addable rails; soft cap 8.
- Ranked hottest-first by velocity score.
- Counts TTL ~12 min; Grok brief TTL ~20 min.

## Explicit non-goals

- VeniceStats buzz feed duplication (Signal tab)
- Official X Radar embed
- User PAYG UI
- Replacing RSS News

## Follow-on

Memory (24h cold + pins), cluster hydrate, per-rail briefs, Compose `alpha_*` + hot slice, thin handoff: see [2026-07-16-alpha-memory-handoff-design.md](./2026-07-16-alpha-memory-handoff-design.md).
