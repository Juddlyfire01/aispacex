# Post → Performance (re-aim)

**Status:** Building  
**Date:** 2026-07-12  
**Surface:** Post top-tab → `Composer | Performance | Network`

## Product principle

Performance answers three questions for the **loaded profile only**:

1. **What worked?** — which posts drove real engagement (with context).
2. **What changed?** — how engagement metrics moved over time (all metrics, not only followers).
3. **What might have driven it?** — posts that sit next to big moves (correlation, not claimed causality).

No global averages, industry baselines, or absolute “real enough” floors.

## Metrics tracked

From X `public_metrics` on each post:

| Field | Source | Role |
|-------|--------|------|
| impressions | impression_count | Reach |
| likes | like_count | Soft engagement |
| reposts | retweet_count | Amplification |
| replies | reply_count | Conversation |
| quotes | quote_count | High-effort amplification |
| bookmarks | bookmark_count | Save intent |

Profile: **followers** (snapshot history for week-over-week growth).

### Pure retweets excluded

Performance totals, ranking, series, catalysts, and snapshots **exclude `kind === 'retweet'`**.

X copies the original post’s `public_metrics` (especially `retweet_count`) onto the retweet shell. Summing those credits viral *others* as this account’s earned engagement. Originals, replies, and quotes still count.

## Rank modes

Top posts sorted **high → low** by:

- **Composite** (default) — X-style weighted engagement (2023 public heavy-ranker weights, adapted to public counts)
- Impressions · Likes · Reposts · Replies · Quotes · Bookmarks

### X-style composite (public 2023 table)

```
score =
  0.5  × likes
+ 1.0  × reposts
+ 13.5 × replies
+ 12.0 × quotes     // high-effort; not a named 2023 row — aligned with strong actions
+ 10.0 × bookmarks  // save intent; adapted
```

Impressions are **not** in the weighted sum (empty reach does not beat real engagement). Impressions remain a first-class rank mode and chart series.

Label in UI: “X-style weights (2023 public)” — not “official live algo score.” Live X weights are private.

## Time & deltas

- Window control: **7d / 30d / All** (default 30d).
- **Period compare:** sum metrics for posts *created* in current period vs prior equal period (works immediately from library).
- **Daily series:** bucket posts by `createdAt` day; sum active metric (or X-score) for the line chart.
- **Follower snapshots:** on each successful profile gather, append `{ at, followers, …engagement totals at gather }`. Week-over-week follower Δ when ≥2 samples.

## Catalyst strip

When a metric’s current period is clearly up vs prior (or a follower snapshot jump), surface top posts by X-score **created in the stronger window** as “posts that stood out while this moved.” Copy stays correlational.

## Layout

1. Controls (window + rank mode)
2. Glance: key totals + period deltas (impressions, likes, X-score, followers when known)
3. Line chart: daily series for active rank metric
4. Top posts list (context: text, kind, all six metrics when expanded, open on X)
5. Catalyst strip when a move is detected

## Profile scope

Performance rail (You + Others) + compose-driven default. Selection does not rewrite chat history.

## Out of scope

- Private X analytics / live algo weights
- Per-post metric version history (likes day 1 vs day 7)
- Causal claims about follows
