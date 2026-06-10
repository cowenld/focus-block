# Focus Block — Chrome Extension

A free, privacy-respecting Manifest V3 Chrome extension that blocks distracting websites on recurring daily schedules. Fully local, zero data collection, no backend.

## Quick Reference

- **Type:** Chrome Extension (Manifest V3)
- **Version:** 0.1.0
- **No build step** — plain JS, CSS, HTML. Load directly as unpacked extension.
- **No dependencies** — no npm, no bundler, no framework.
- **Test in Chrome:** `chrome://extensions` → Developer mode → Load unpacked → select this directory.

## Architecture

```
manifest.json          ← Extension entry point
background.js          ← Service worker: rule evaluation, DNR, alarms, message hub
storage.js             ← Data layer: chrome.storage.local/sync abstraction
schedule-engine.js     ← Pure functions: time window evaluation, next-boundary calc
matching.js            ← Pure functions: domain matching, URL checking
popup.html/js/css      ← Toolbar popup: status, Focus Now, quick-block
options.html/js/css    ← Full settings UI: schedules, lists, allowlist, usage, settings
blocked.html/js/css    ← Block page: countdown, escape actions (snooze/allow/end-early)
onboarding.html/js/css ← First-run flow: template selection, passphrase nudge
icons.js               ← Inline SVG icon helper (Lucide-style)
presets/*.json          ← Bundled site lists (social, news, streaming)
docs/design-doc.md     ← Full design document with all decisions (D1-D12)
docs/backlog.md        ← Deferred features and known limitations
```

## Data Model (storage.js)

All state lives in `chrome.storage.local['focusBlock']`:

```
schedules[]        — Array of Schedule objects (id, name, days[], startTime, endTime, blackout, adHocSites[], listIds[], enabled)
lists[]            — Array of List objects (id, name, sites[], origin: "user"|"frozen"|"live")
allowlist[]        — Array of domain strings (always wins over blocklist)
settings           — { frictionLevel, passphrase, theme, syncEnabled, cooldownSeconds, snoozeDurationMinutes, onboardingComplete }
focusSession       — Active focus session or null (duration, endTime, blackout, domains)
usage              — { blockCounts, escapeCounts, snoozeCounts, siteTime } keyed by "domain|YYYY-MM-DD"
commitmentEndTimes — { scheduleId: timestamp } for resume-on-re-enable
```

## How Blocking Works (Three Layers)

1. **DNR rules** (`chrome.declarativeNetRequest`) — redirect matched URLs to `blocked.html`
2. **Navigation intercept** (`chrome.webNavigation.onCommitted`) — catches redirects DNR misses
3. **Cached block state** (`_blockState` in storage) — fast lookup for blocked.js

`background.js:updateBlockingRules()` is the main orchestrator — called when schedules change, alarms fire, or focus sessions start/end.

## Message Protocol (chrome.runtime.sendMessage)

Messages from popup/options/blocked → background.js:

| type | purpose | sender |
|------|---------|--------|
| `getBlockStatus` | current block state | popup |
| `startFocus` | begin focus session | popup |
| `endFocus` | cancel focus session | popup |
| `refreshRules` | force re-evaluation | options, popup, onboarding |
| `snooze` | temporarily unblock domain | blocked |
| `allowPermanently` | add to allowlist | blocked |
| `endBlockEarly` | disable schedule until next window | blocked |
| `getSettings` | return current settings | blocked |

## Key Design Decisions

- **D1:** Self-control commitment device, not security enforcement
- **D3:** Single global allowlist — always wins, keeps email/banking reachable in blackout
- **D5:** Friction off by default, opt-in. Three levels: none / wait / passphrase
- **D6:** Domain-level matching only (v1). Subdomains auto-matched. Path-level deferred to P2
- **D8:** Zero runtime network. No network permission in manifest. Presets bundled
- **D10:** Passphrase = user's own reason. Exact match, paste disabled
- **D11:** Sync is config-only (last-write-wins). Usage stays local

## Domain Matching (matching.js)

- Matches registrable domain + all subdomains
- `reddit.com` blocks `reddit.com`, `www.reddit.com`, `old.reddit.com`
- Normalization: lowercase, strip `www.` prefix
- Allowlist checked first (always wins)

## Schedule Engine (schedule-engine.js)

- Time windows support midnight-crossing (e.g., 22:00–07:00)
- `days[]` uses 0=Sun through 6=Sat (empty = every day)
- `getNextWindowBoundary()` returns minutes until nearest schedule start/end (max 60)
- Blackout mode = block everything except allowlist

## Coding Conventions

- Plain vanilla JS — no TypeScript, no JSX, no imports/exports (script tags in HTML)
- Functions use `chrome.storage.local` via storage.js helpers, never raw API
- HTML escaping via `esc()` function in options.js to prevent XSS
- Icons are inline SVG via `icon(name, size)` from icons.js
- Async message handlers wrapped in `.catch()` to avoid service worker crashes
- `isUpdatingRules` guard in background.js prevents re-entrant storage listener loops

## Common Tasks

**Add a new escape action on the block page:** Edit `blocked.js` — add button in `blocked.html`, handler in `blocked.js:executeAction()`, message type in `background.js` message listener.

**Add a new setting:** Add default to `storage.js:DEFAULT_DATA.settings`, add UI in `options.html`/`options.js` Settings tab, read in whichever script needs it.

**Add a new preset:** Create `presets/name.json` with `{name, origin: "frozen", sites: [...]}`, add to `manifest.json` web_accessible_resources, reference in `onboarding.js` templates.

**Modify blocking logic:** Core is in `background.js:updateBlockingRules()` and `schedule-engine.js:getActiveBlockedDomains()`.

## Known Gotchas

- `background.js` is a Manifest V3 service worker — it can be terminated by Chrome at any time. All state must be in `chrome.storage`, not in-memory variables (except transient `isUpdatingRules` flag).
- `blocked.js` runs in an extension page context, not a content script — it can use `chrome.runtime.sendMessage` but not access the blocked page's DOM.
- Sync payload has 8KB quota per item — no sharding implemented yet (known limitation in backlog).
- Schedule times are "HH:MM" strings compared lexicographically for midnight-crossing detection.
