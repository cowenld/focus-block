# T001 — Design Document Map

## Design Doc Location
`/Users/cdyke/Documents/10.Projects/10.MyProjects/focus-block/docs/design-doc.md`
Not committed to any branch — exists only in the main repo working directory.

## P0 MVP Features (what we're building)
1. **Schedules** — name, active days, time window (start/end, may cross midnight), action (block page or redirect), per-schedule blocklist
2. **Blocklist model** — union of referenced Lists + ad-hoc individual sites per schedule
3. **Lists** — user lists (editable collections), frozen presets (forked copies), live presets (bundled, refresh on extension update)
4. **Domain-level matching** — registrable domain + all subdomains
5. **Global allowlist** — always wins; powers blackout mode ("block everything except these")
6. **Focus Now** — ad-hoc immediate block for a chosen duration
7. **Block page** — shows schedule name, site, when it lifts (countdown), calm tone
8. **chrome.storage.local** — all state persisted, never in worker memory
9. **Zero network** — no fetch, no host permissions

## Architecture (from §12)
- Manifest V3
- **Hybrid blocking:** `declarativeNetRequest` dynamic rules for domain-level network blocking + `tabs.onUpdated`/`webNavigation` listener for navigation-time redirect to blocked.html
- `chrome.alarms` toggles rulesets at window boundaries AND re-evaluates already-open tabs
- All state in `chrome.storage` (schedules, lists, allowlist, settings, usage counters)
- Permissions: `declarativeNetRequest`, `storage`, `alarms`, `tabs`/`webNavigation`

## Data Model (from §4)
- **Site** — single domain entry, matches registrable domain + all subdomains
- **List** — named collection of sites (user / frozen preset / live preset)
- **Schedule** — name, days[], timeWindow{start,end}, action(block|redirect), blocklist = union(lists) + adHocSites[]
- **Allowlist** — global, always wins
- **Focus Now** — ad-hoc session with duration

## Precedence Rules (§4.6)
1. Allowlist always wins
2. Blocked if matched by any active schedule's effective blocklist during its window, OR active Focus session, OR blackout
3. Multiple schedules = union of windows

## P1 Features (deferred from MVP)
- Onboarding flow with templates
- Bundled presets (frozen starters + live categories)
- Friction stack (resume-on-re-enable, recursive passphrase, teardown cooldown)
- Block-moment escape actions (snooze/allow/end early)
- Usage dashboard + coaching
- Redirect action, popup, JSON export/import
- Cross-Chrome sync (config-only)

## Gaps / Ambiguities
- No specific UI framework mentioned — need to decide (vanilla JS recommended for extension simplicity)
- Block page escape actions are listed under P1, not P0 — MVP block page is display-only
- Popup is listed under P1 but referenced in P0 context — MVP should have a minimal popup
- No build tooling specified — keep it simple for v1 (no bundler)
- Preset list content not specified — need to create Social/News/Streaming/Adult domain lists

## Recommended Implementation Order
1. Extension skeleton (manifest, service worker, storage) + blocking engine + block page
2. Options page UI (schedules CRUD, lists, allowlist)
3. Popup + Focus Now
4. Schedule edge cases (midnight crossing, already-open tabs, alarms)
