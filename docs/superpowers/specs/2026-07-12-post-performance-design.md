# Post → Performance — Top Posts & Patterns

**Date:** 2026-07-12  
**Status:** Implemented  
**Depends on:** Compose Post layout (`ComposeWorkspace` sub-tabs), intel `Post` metrics, self/target post stores, existing `computeAnalytics` primitives  
**Non-goals (v1):** Full Network graph, Profile Report embed, post-publish tracking from Compose, LLM narrative

---

## 1. Goal

Add a **Performance** sub-tab under **Post** that answers, for the active compose profile:

> What performed well — show me the winners and the pattern underneath.

It sits at the intersection of **Stats ∩ Feed ∩ Network-lite** without stacking their density:

- **Stats DNA** — enough baselines to judge “above this account’s normal”
- **Feed DNA** — real posts as the unit (text + metrics)
- **Network DNA (light)** — optional “amplified by …” hints when data already exists; deeper amplifiers belong in a future Network sub-tab

Composer stays for writing. Performance stays for learning from outcomes.

---

## 2. Problem (today)

| Area | Current | Pain |
|------|---------|------|
| Post sub-tabs | Composer live; Feed/Network blank placeholders | Reserved chrome with no learning surface |
| Analytics | Full `AnalyticsPanels` on Profile Report | Dense; not adjacent to composing |
| Feed | Chronological activity list | Shows metrics but does not rank “what worked” |
| Publish path | Returns `{ id, url }` only | No dedicated “how did my posts do” workspace in Post |

---

## 3. Decisions (locked)

| Topic | Choice |
|-------|--------|
| Approach | **Glance + Top + Patterns** (balanced) — not feed-sorted-only, not report-lite |
| First viewport | **Top posts** above the fold; **patterns** as secondary strip below |
| Naming | **Top posts** (never “bangers”) |
| Scoring | **Hybrid** — relative to this profile’s own distribution + small absolute floor |
| Ranking modes | **Filtered views**, not one locked formula: engagement rate · amplification · likes · composite |
| Time window | User-switchable **7d / 30d / all gathered**; **default 30d** |
| Chrome placement | Replaces empty **Feed** slot → `Composer` \| `Performance` \| `Network` |
| Network DNA (v1) | **Light** one-line amplifiers per top post when data exists; full Network tab later |
| Profile scope | Always the **active compose profile** (default self) — same context spine as Composer |
| Language | Everyday metric names only (match report narrative rules) |

---

## 4. Surface

### 4.1 Post chrome

```
ComposeWorkspace
├── History rail (unchanged)
└── Main pane
    ├── SubTabs: Composer | Performance | Network
    ├── Composer  → existing compose UI
    ├── Performance → new PerformanceView (this spec)
    └── Network → placeholder (unchanged for v1)
```

- Sub-tab ids may keep mirrored You/Others ids (`profile` / `feed` / `network`) **or** rename `feed` → `performance` in code — implementer choice; **labels** must be Composer / Performance / Network.
- Entering Performance does not clear the active compose thread.

### 4.2 Layout (Performance pane)

```
+------------------------------------------------------------------+
| Controls:  Window [7d|30d|All]    Rank by [Rate|Amp|Likes|Comp]  |
+------------------------------------------------------------------+
| Glance:  eng. rate | top-post count | leading kind | vs median   |
+------------------------------------------------------------------+
| Top posts                                                        |
|  [expanded #1] text · kind · metrics · why · amplified by …      |
|  [#2] …                                                          |
|  [#3] …                                                          |
+------------------------------------------------------------------+
| Patterns                                                         |
|  performance-by-kind  |  2–3 examples of winning pattern         |
+------------------------------------------------------------------+
```

**Above the fold (priority):** controls → glance → top posts (first item expanded).  
**Below:** patterns strip. No cadence histograms, topic clouds, or full analytics grids in v1.

### 4.3 Controls

| Control | Options | Default |
|---------|---------|---------|
| Window | 7d · 30d · All gathered | 30d |
| Rank by | Engagement rate · Amplification · Likes · Composite | Composite |

Window filters the candidate post set **before** scoring. Rank by only changes sort key and which metric is emphasized in rows / glance.

### 4.4 Glance strip (3–4 KPIs)

Computed over the **window-filtered own posts** for the resolved profile:

| KPI | Meaning |
|-----|---------|
| Engagement rate | Window total `(likes + reposts + replies + quotes) / impressions` (0 if no impressions). Note: Profile Report’s `engagementRate` is likes-only — Performance uses the broader interaction rate above. |
| Top posts | Count of posts that pass hybrid eligibility (see §5) |
| Leading kind | Kind with highest average score under the active rank mode |
| vs median | Median top-post multiple vs profile median on the active rank metric (omit if &lt; 1 top post) |

Reuse existing `Stat` / compact KPI chrome from intel/stats UI — not Signal VeniceStats cards unless already natural in Post.

### 4.5 Top posts list

- Ranked descending by active rank mode (§5).
- Cap list length (recommend **10**; hard max **20**).
- First row **expanded by default**; others collapsed; click expands one at a time (accordion).
- Row chrome (collapsed): truncated text · kind pill · primary metric for active filter · optional `N×` vs median.
- Expanded: full text (reasonable clamp + “open on X”), all core metrics (views/likes/reposts/replies/quotes), short **why** line, light **amplified by** line.
- Clicking through to X URL when available; optional jump-to-feed focus is out of scope unless trivial reuse exists.

### 4.6 Why line (deterministic, no LLM)

One short sentence from templates, e.g.:

- “3.2× this account’s median engagement rate; clears the absolute floor.”
- “Top amplification in window; strong vs median likes.”

No free-form model copy in v1.

### 4.7 Amplified by (Network-lite)

When the profile’s gathered **edges** (or equivalent interaction data) name other users who quote/repost/reply-engage the post, show up to **3** handles: `amplified by @a, @b, @c`.

- If none: omit the line entirely (no empty state).
- Do not build a mini graph or ranked amplifier panel in v1.
- Purpose: bridge to a future Network sub-tab without owning that surface.

### 4.8 Patterns strip

- **Performance by kind** — bars or compact rows for original / reply / quote / retweet using the **same active rank metric** (avg per kind over the window).
- **Winning pattern examples** — 2–3 posts from the leading kind (by that metric), distinct from or overlapping the top list is fine; prefer diversity if the top list is already all one kind.
- One sentence caption, e.g. “Originals lead on composite in this window.”

---

## 5. Scoring

### 5.1 Candidate set

1. Resolve profile (§6).
2. Take **own** posts for that profile (exclude inbound-only mentions unless authored by profile — same partition spirit as `computeAnalytics`).
3. Filter by window relative to `createdAt` (7d / 30d / all).
4. Exclude posts with insufficient signal for the active mode when needed (e.g. engagement rate with `impressions === 0` cannot rank on rate — drop from rate view or treat as unscored last; prefer **exclude from rate ranking**).

### 5.2 Per-mode metrics (per post)

| Mode | Metric |
|------|--------|
| Engagement rate | `(likes + reposts + replies + quotes) / impressions` |
| Amplification | `reposts + quotes` |
| Likes | `likes` |
| Composite | Normalized blend: `0.5 * rateNorm + 0.35 * ampNorm + 0.15 * likesNorm` where each `*Norm` is the post’s value divided by that metric’s **median among candidates in the window** (median 0 → fall back to max or skip that term) |

Composite is the default rank mode; other modes are first-class filtered views of the same candidate set.

### 5.3 Hybrid eligibility (“top post”)

A post is a **top post** (counts toward glance + eligible for the highlighted set) when **both**:

1. **Relative:** metric ≥ **max(median × 1.5, p75)** among candidates for the active mode (implementer may tune constants; lock in plan tests).
2. **Absolute floor** (avoid crowning noise on tiny accounts):
   - Likes / composite: `likes >= max(5, min(50, round(followers * 0.001)))`
   - Amplification: `reposts + quotes >= 2`
   - Engagement rate: `impressions >= 100` **and** rate ≥ profile median rate (among candidates)

v1 list = eligible top posts only. If fewer than 3 eligible but the window has posts, fill with next-best by score up to 3 and mark those fills as below threshold. A dimmed “rest of window” section is out of scope.

### 5.4 vs median display

`multiple = postMetric / medianMetric` when median &gt; 0; show as `N×` rounded to one decimal.

---

## 6. Profile scope & data sources

### 6.1 Resolve active compose profile

Single profile only (Performance is not “All”):

1. If active thread scope is `me` → primary / selected self account.
2. If active thread scope is `target@user` → that username.
3. Else use `newThreadContext` if it is `me` or a target.
4. Else fall back to primary self account if connected.
5. If scope is `all` and no fallback self → empty state: “Pick You or a target in Composer settings to see Performance.”

Changing compose context (new thread / settings) updates Performance on next render; no separate profile picker on the Performance pane in v1.

### 6.2 Post & edge sources

| Profile | Posts | Edges / amplifiers |
|---------|-------|--------------------|
| Self | `x-self-store` account posts | Self report edges if present; else omit amplifier lines |
| Target | Matching `x-intel-store` report posts | Report edges |

No new X API gather in v1 — operate on **already gathered** intel. If posts empty: empty state pointing user to gather/refresh on You or Others.

### 6.3 Analytics reuse

Prefer extracting pure helpers from / alongside `src/lib/x-intel/analytics.ts` (medians, rates, by-kind averages) rather than mounting full `AnalyticsPanels`. Do not invent a parallel metrics schema; use intel `Post.metrics`.

---

## 7. Components (suggested)

| Unit | Responsibility |
|------|----------------|
| `PerformanceView` | Pane shell; resolve profile; wire window + rank state |
| `PerformanceControls` | Window + rank segmented controls |
| `PerformanceGlance` | KPI strip |
| `TopPostsList` / `TopPostRow` | Ranked list, expand/collapse, why, amplifiers |
| `PerformancePatterns` | By-kind bars + example posts |
| `lib/compose/performance.ts` (or `lib/x-intel/performance.ts`) | Pure: filter window, score, eligibility, sort, why templates |

Keep UI in `src/components/compose/` (Post-owned) and scoring in `lib/` with unit tests. Avoid bloating `compose-workspace.tsx` beyond sub-tab label + mount.

---

## 8. State

- **Local UI state** for window + rank mode + expanded post id is enough for v1 (reset on profile change).
- Optional persist in `compose-store` or localStorage later — **YAGNI for v1**.
- Do not add Performance fields to `PostDraft`.

---

## 9. Empty, loading, error

| Case | UI |
|------|----|
| No resolvable profile | Prompt to pick You / target in Composer settings |
| Profile resolvable, zero posts gathered | “No posts in library for @user — gather from You/Others” |
| Posts exist, none in window | “No posts in this window — try 30d or All” |
| Scoring ok, zero eligible | Show next-best fill (§5.3) with below-threshold mark; never a blank pane if any posts exist in window |
| Missing impressions for rate mode | Exclude unscored posts; if all excluded, suggest another rank mode |

No toast spam; inline empty copy only.

---

## 10. Out of scope (explicit)

- Renaming or implementing the Network sub-tab beyond placeholder
- LLM “coach” narrative or rewrite suggestions from top posts
- Live refresh / webhook after publish from Composer
- Comparing two profiles side-by-side
- Cadence/hour heatmaps, topic clouds, bookmark deep-dives
- Editing drafts from a top post (inspiration → draft) — nice follow-on, not v1

---

## 11. Testing

| Layer | Coverage |
|-------|----------|
| Unit | Window filter; each rank metric; composite norms; hybrid eligibility; why template strings; profile resolve precedence |
| Component (light) | Empty states; accordion expands one row; rank mode switch reorders |
| Manual | Self with gathered posts; target with report; `all` context empty/fallback; 7d vs All |

---

## 12. Success criteria

- From Post, user can open **Performance** and within one glance see whether the active profile has clear winners in the default 30d window.
- Switching rank filters changes order without navigating away.
- Patterns strip makes the leading kind obvious without opening Profile Report.
- Density stays below Profile Report; no third analytics dump.
- Amplifier lines appear only when data exists and never dominate the layout.
