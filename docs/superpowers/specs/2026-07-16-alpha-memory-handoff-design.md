# Alpha Memory + Handoff — Design

**Date:** 2026-07-16  
**Status:** Approved for planning  
**Depends on:** [2026-07-15-alpha-watchlist-design.md](./2026-07-15-alpha-watchlist-design.md) (Radar surface)

## Product intent

Alpha is **trending / hot** — not a long-term library. Memory is a rolling window so Compose can reuse what Radar just found. Composer handoff is thin: Alpha finds, Composer writes.

**Primary job:** memory-first (hot/cold → hydrate → per-rail briefs → thin handoff).

## Decisions locked

| Topic | Choice |
|-------|--------|
| Architecture | Dual-store: Alpha owns encrypted IndexedDB archive; Compose adapters (hot slice + `alpha_*` tools) |
| Cold contents | Briefs + auto-kept news snapshots + auto-kept hydrates |
| Retention | Soft **24h** for unpinned items; **pins** until unpin; handoff seeds Compose thread as the other keep path |
| Compose access | Hot-window Alpha slice **and** `alpha_list` / `alpha_grep` / `alpha_get` |
| Storage backend | Existing encrypted IndexedDB (`createEncryptedStorage`) — not localStorage. Caps are **product housekeeping** (24h), not a 5MB survival strategy. |

## §1 Memory model

### Hot (working set)

Live Radar surface: rail counts (~12 min TTL), last global + per-rail briefs, current news scan, open hydrates. Fast to render; also written through to cold when kept.

### Cold (Alpha archive)

Encrypted via `alpha-store` (IndexedDB):

| Object | Auto-kept? | Lifetime |
|--------|------------|----------|
| Global / per-rail Grok briefs | On successful run | 24h unless pinned |
| News story snapshots | On scan | 24h unless pinned |
| Hydrated cluster posts | On hydrate | 24h unless pinned |
| Pins | Explicit UI | Until unpin |

### Durability outside Alpha

**Open in Composer** seeds a Compose thread. That copy lives in Compose history. Alpha may expire the cold item at 24h; the thread does not.

### Prune

On read/write and when Alpha opens: drop unpinned items with `fetchedAt < now - 24h`.

### Compose bridge (summary)

- Hot-window slice: recent non-expired (+ pinned) Alpha items, small token budget  
- Tools: read-only `alpha_*` over the same set  

## §2 Cluster hydrate + per-rail briefs

### Cluster hydrate

1. X News already exposes `clusterPostIds`.  
2. On expand / “Load cluster”: `GET tweets?ids=…` in chunks; bound e.g. **first 25** ids per story.  
3. Map to `AlphaPostCard`; show under the story; **auto-keep** cold (24h).  
4. Per post: open on X; **Reply/Quote** via existing `openComposeForPost`.  
5. Dedupe by post id across stories/rails.

### Per-rail briefs

- Same Venice `enable_x_search` path as the global brief, scoped to one rail.  
- Optional `extraContext`: top live posts if loaded, related news hooks.  
- Cache key: `railId` + query hash (query edit invalidates).  
- UI: “Brief this rail”; soft nudge on hottest rail.  
- Result → surface + auto-keep cold.  
- Explicit click only — do not auto-fire all rails.  
- Global brief remains the whole-watchlist pass.

### Rail signal order

Counts/velocity → live posts → brief → related news/hydrate when relevant.

## §3 Compose wiring

### Hot-window Alpha slice

When packing the Compose hot window, append a small **Alpha** block from cold (24h + pins):

- Prefer newest global brief, recent/pinned per-rail briefs, few story titles + ids  
- Modest token share; if the overall window is tight, drop Alpha before core intel  
- Label as Radar archive (not Intel subjects)

### Tools (read-only)

| Tool | Job |
|------|-----|
| `alpha_list` | Recent briefs / stories / hydrates (kind, railId, pinned, since) |
| `alpha_grep` | Substring over brief markdown, story text, post text |
| `alpha_get` | One brief; or story + hydrated posts; or posts by ids |

No agent pin/unpin or Alpha writes in v1.

### Prompt hint

Alpha = 24h trending memory; `alpha_*` for Radar; `intel_*` for gathered profiles; drafting via existing draft tools.

### Non-goals

- Auto-running Grok briefs from Compose  
- Agent mutating Alpha cold  
- Mirroring into Intel library  

## §4 Thin Composer handoff

| From | Action | Behavior |
|------|--------|----------|
| Brief | Open in Composer | New thread; seed brief + rail metadata; switch to Composer |
| News story | Open in Composer | Seed name/hook/url + cluster links |
| Post | Reply / Quote | `openComposeForPost` |
| Rail (no brief) | Open in Composer | Seed label + query + velocity line |

- Short display summary in the bubble; full body in the real user payload (Sphere-style display vs prompt split OK).  
- Does **not** auto-call `compose_write_draft`.  
- Does **not** run Sphere Report phases from Alpha.

### Non-goals (v1)

- Multi-phase workflow from Alpha  
- Auto-draft on handoff  
- Syncing Compose edits back into Alpha cold  

## §5 Errors, testing, rollout

### Errors

- Hydrate / brief / news failures stay local; don’t wipe cold.  
- Partial hydrate OK.  
- Failed brief → message + retry; don’t store empty shells.  
- `alpha_*` on empty window → clear “nothing in 24h” style result.

### Testing

- 24h prune + pins  
- Insert + dedupe for briefs/stories/posts  
- `alpha_list` / `alpha_grep` filters  
- Hot-slice packing under budget  
- `alpha-store` migration for new cold fields  

### Implementation order

1. Cold schema + prune + pin in `alpha-store`  
2. Cluster hydrate + auto-keep  
3. Per-rail briefs + auto-keep  
4. Compose hot slice + `alpha_*` tools  
5. Thin handoff buttons  

## Out of scope

- Official X Radar embed  
- User PAYG / cost UI  
- Replacing RSS News or Signal VeniceStats  
- Intel-library mirror as primary cold store  
- localStorage-era quota survival caps (obsolete; housekeeping is 24h product policy)
