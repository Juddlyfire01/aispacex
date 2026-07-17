# Compose Skills Templates — Design

**Date:** 2026-07-16  
**Status:** Implementing  
**Branch:** `skills`  
**Replaces:** Sphere Report + Signal Dossier + By the Numbers + Rebuttal Brief + Bull Thesis

## Intent

The five report templates were isolated complete jobs. Stacked or re-run across days they re-skinned the same edition. Replace them with a **skill-stage pipeline** that compounds craft, keeps **all Compose tools always available**, and **force-injects SPENT / PRIOR ART** from own posts and prior drafts.

## Decisions locked

| Topic | Choice |
|-------|--------|
| UX | Keep Templates menu + empty-state starter; new five stages |
| Tool access | Full tool surface every stage (no allowlists) |
| Craft source | Harvest from jnkindi/x-post-generator-skill (principles, hooks, levers, anti-patterns) — not vendored clone |
| Anti-repetition | Engineered `spent-content` packer + hard writer rules (not prompt-only “go look”) |
| Out of scope | Edition IndexedDB, embedding novelty scorer, HN/Reddit calendars |

## Pipeline

```
Discover → Angles → Craft post → (Craft thread) → Polish
Free chat may jump to Craft / Polish
```

| id | Label | Deliverable | preferredFormat |
|----|--------|-------------|-----------------|
| `discover` | Discover | Chat intelligence brief only | `auto` (do not force) |
| `angles` | Angles | Tier S/A/B candidates with `[lever]` / `[end]` | `auto` |
| `craft-post` | Craft post | Draft drawer | `post` |
| `craft-thread` | Craft thread | Draft drawer | `thread` |
| `polish` | Polish | Revise current draft via `compose_write_draft` | leave unchanged |

**PRIMARY_TEMPLATE** = Discover.

Stages differ in job/output. They never strip tools. Discover/Angles discourage early `compose_write_draft` in the prompt; the tool remains available.

## Skill modules

`src/lib/compose/skills/`:

- `principles.ts` — specificity, reply provocation, screenshot independence, anti-bait
- `hooks.ts` — hook patterns + single/thread structures
- `levers.ts` — dwell→reply→profile chain synthesis
- `anti-patterns.ts` — death traps + pre-publish checklist
- `craft-inject.ts` — compact CRAFT block for system + writer prompts

Skip: posting calendars, HN/Reddit/Substack, owned-channel campaign framing.

## SPENT / PRIOR ART pack

`src/lib/compose/spent-content.ts` builds a budgeted block (~2–4k tokens) from:

1. Own library posts (self subject): originals, quotes, replies, articles
2. Recent Compose draft bodies from history threads
3. Optional current draft drawer text (Polish baseline)

Per item fingerprints: opening line, normalized slogans, cited post ids, heavy `$` / `@` stacks.

**Inject always** (when non-empty):

- Research agent: beside hot window on every send
- Draft writer: same pack in user/system path so truncation cannot drop it

**Hard rules:** reusing spent opener/slogan/exhibit spine = FAILED draft; thin novelty → shorter, never pad.

## Scaffolding

`skill-pipeline.ts` shares tool reminder + spent reminder + handoff contract.  
`ComposeTemplateStarter` kept; `preferredFormat: 'auto'` means launch does not call `setPreferredFormat`.

## Verification

- Registry: five ids, PRIMARY = discover
- Spent-pack tests: newest-first, fingerprints present, budget trim
- CRAFT + SPENT markers in compose + writer systems
