# Focus Block — Feature Backlog

Unbuilt features from the design document, ordered roughly by impact. Items marked with their original priority tier for context.

---

## Incomplete P1

These were scoped in P1 but not fully implemented in the initial build.

- [ ] **Floating on-page countdown timer** — an optional small overlay on blocked pages showing remaining time in the active Focus or schedule session. Requires a content script injected into web pages. *(§9)*
- [ ] **Live preset: Adult** — a large bundled category list for adult content sites that refreshes on extension update (not a frozen fork). Needs a curated source list. *(§4.2, D4)*
- [ ] **Empty-state reuse** — clearing all schedules/lists should return to the onboarding template-and-teach flow rather than a blank void. Currently shows a basic empty state. *(§6.1)*

## P2

Features explicitly deferred in the design document.

- [ ] **Path-level blocking** — block specific paths like `linkedin.com/feed` while allowing `linkedin.com/messaging`. Requires a content script watching client-side route changes. Fragile for SPAs. *(§8, §11.3)*
- [ ] **In-page blocking** — e.g. YouTube Shorts vs normal videos. Same content-script dependency as path-level. *(§8)*
- [ ] **Per-site daily time budgets** — a quota distinct from a time window. "15 minutes of Reddit per day" rather than "blocked 9–5." Needs active-tab time tracking (focus, audible, idle detection). *(§11.3, §13.4)*
- [ ] **Wildcard/keyword blocking UI** — `*.x.com` or keyword-based blocking behind an "advanced" affordance. Domain wildcards are partially supported in matching.js but no UI exists. *(§8, §11.3)*
- [ ] **Competitor import** — parse LeechBlock NG and StayFocusd JSON export formats. Needs format research for each. *(§11.3, §13.6)*
- [ ] **Custom CSS on block page** — let users apply their own HTML/CSS to the blocked page. *(§11.3)*
- [ ] **Pomodoro-style sessions** — work/break cycles with automatic timers, distinct from Focus Now's simple countdown. *(§11.3)*

## Known limitations

Working features with documented edges, in rough priority order.

- [ ] **Sync payload sharding** — synced config is stored as a single `chrome.storage.sync` key, which has an 8KB-per-item quota. A very large config (dozens of lists with hundreds of sites) exceeds it and the sync write fails silently (caught, logged nowhere). Fix: shard the payload across multiple keys, or surface a "config too large to sync" notice in Settings. *(§12 quota note)*

## Ideas (not in design doc)

Space for future ideas that come up during development or user feedback.

- [ ] *Add items here as they come up*

---

**Last updated:** 2026-06-10
