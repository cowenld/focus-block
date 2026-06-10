# Project Design Document — Website Blocker (Chrome Extension)

**Status:** Draft v0.3 · **Date:** 9 June 2026 · **Type:** Manifest V3 browser extension

> **Changes in v0.3:** full design of the **block moment** (block page + escape valve + passphrase); **onboarding & empty states**; the **schedule editor** anatomy; **coaching** locked as rule-based and fully local (no LLM); **category lists bundled** for zero runtime network; scope dispositions for sync, import/export and the sweep items. Competitive research (§15) unchanged.

---

## 1. Summary

A free, privacy-respecting Chrome extension that blocks user-defined websites on recurring daily schedules (e.g. block these domains 09:00–17:00, Mon–Fri). The thesis: ~90% of what incumbents paywall has zero marginal cost, so the whole feature set can be free and **fully local** with no data collection. It is positioned as a **focus / self-control commitment device** that is also a **shippable product** — single-user, no backend, open-source. Explicitly **not** security-grade enforcement (§7).

The wedge in a crowded free market is three things competitors don't combine: **provable privacy** (zero runtime network), a **calm/humane personality** (a commitment device, not a punishment), and **coaching that's local and gentle** (insight that suggests, never shames).

## 2. Decisions log (settled)

| # | Decision | Outcome |
|---|---|---|
| D1 | Positioning | Self-control-first, also shippable. Single-user. No kids/parental mode, no accounts, no backend. |
| D2 | Blocklist model | Not one global list. Sites live **inside schedules** as ad-hoc entries and/or via reusable **Lists**. |
| D3 | Allowlist | One **global** allowlist, always wins; also powers a "block everything except these" blackout mode. |
| D4 | Presets | **Bundled in the extension.** "Live" tracks the bundled copy (refreshes on extension update); "frozen" is a forked, editable copy. No runtime fetch. |
| D5 | Friction | Off by default, opt-in, self-imposed. Resume-on-re-enable + recursive typing challenge + cooling-off countdown for teardown. Flat cost (no escalation). Honest copy. |
| D6 | Matching | **Domain-level for v1** (registrable domain + all subdomains). Wildcards behind "advanced". Path/in-page deferred. |
| D7 | IA | Four sections — Schedules · Allowed sites · Usage · Settings — plus a popup, the block page, and onboarding. |
| D8 | Privacy | **Zero runtime network** (lists bundled). No network/host permission. Open-source. |
| D9 | Coaching | Rule-based + templated, fully local. **No LLM, no external data** — not even earmarked for later. |
| D10 | Passphrase | The user's own *reason*, set in Settings, reused everywhere. Exact match, paste disabled, typing-test UX. Recursive (changing it requires typing the current one). |
| D11 | Sync | v1, **config-only**, last-write-wins. Usage stays local. |
| D12 | Import/export | Own JSON in v1. Competitor-import (LeechBlock/StayFocusd formats) parked as later research. |

## 3. Goals / Non-goals

**Goals**
- Unlimited sites/lists, free, forever.
- Recurring daily schedule windows (days + time-of-day) as the core feature.
- 100% local, zero runtime network: no accounts, no backend, no telemetry.
- Honest friction that defeats impulse without pretending to be unbreakable.
- A calm, supportive personality across every surface.

**Non-goals**
- Not a security product. Not truly unbypassable. Not parental-control-grade.
- No mobile apps, no OS-level enforcement, no server, no LLM.

## 4. Core concepts & data model

Separates the **what** (sites/lists) from the **when/how** (schedules), with one global safety net (allowlist).

### 4.1 Site
A single domain entry. **Matches the registrable domain and all subdomains** (`reddit.com` catches `www.` and `old.reddit.com`). Full rules in §8.

### 4.2 List
A named, reusable collection of sites. **Lists are pure — sites only, no timing.** The noun to a schedule's verb, which keeps a list reusable across very different schedules. Three origins:
- **User lists** — created/edited by the user (e.g. "Social", "Shopping").
- **Frozen presets** — small opinionated starter templates ("Social media", "News", "Streaming"). Pulling one in **forks an editable copy**; it never changes underneath the user.
- **Live presets** — large fast-moving categories that can't be hand-curated ("Adult", and a future malware list). **Bundled inside the extension** and referenced, not copied, so they refresh when the extension updates. No web fetch (D4/D8).

### 4.3 Schedule
The "when/how". Each has a name, active days, a time window (start/end; may cross midnight), an action (**block page** or **redirect**), and a blocklist of **referenced lists (many-to-many) + ad-hoc individual sites**. Effective blocklist = `union(referenced lists) + ad-hoc sites`. Individual sites can always be dropped straight onto a schedule; lists appear only when reuse is wanted (progressive disclosure). Authored in the schedule editor (§6.2).

### 4.4 Allowlist (global) + blackout mode
One global list of always-reachable sites that **always wins**. Also powers **"block everything except these"** — a per-schedule (or Focus-session) blackout. Primary job is safety: keep email/banking here so a blackout or wildcard can never lock the user out.

### 4.5 Focus now
Ad-hoc immediate commit: block all listed sites (or everything-except-allowlist) for a chosen duration, independent of schedules.

### 4.6 Precedence
1. **Allowlist always wins.**
2. Otherwise blocked if matched by any **active schedule's** effective blocklist during its window, **or** an active **Focus** session, **or** (blackout) it is simply not on the allowlist.
3. A site in multiple schedules is blocked during the **union** of their windows.

## 5. Information architecture

Four sections — against StayFocusd's eleven — plus three supporting surfaces.
- **Schedules** — home. Cards reading as sentences ("Weekdays · 09:00–17:00 · block page"), with site/list chips, a toggle and edit. Prominent **Focus now**.
- **Allowed sites** — the global allowlist + the blackout toggle.
- **Usage** — local-only insights + coaching (§9).
- **Settings** — friction options, the passphrase, lists library, import/export, sync toggle, theme.
- **Popup** — daily touchpoint: status at a glance, Focus-now, quick pause, one-click "block this site."
- **Block page** (`blocked.html`) — the most-seen screen (§6.3).
- **Onboarding** — first-run welcome (§6.1).

## 6. Key flows & screens

### 6.1 Onboarding & empty states
On install, open a welcome tab — **one screen, fully skippable**. Lead with one-tap starter templates backed by bundled preset lists, so nobody types a domain to get value:
- **Work focus** — Social, weekdays, 09:00–17:00.
- **Bedtime** — Social + Streaming, every day, 22:00–07:00.
- **Deep work** — block everything except a short allowlist, on demand via Focus now.
- **Custom** — opens the schedule editor inline (name, days, time, sites).

"Start from scratch" and a small "import from another blocker" sit underneath. **Friction stays out of onboarding** — get a working block first; then offer one optional, skippable nudge: *"want to make it stick? set your commitment phrase."* After creating a schedule, show a quiet confirmation it's live ("youtube.com is now blocked on weekdays, 9–5"). Every later empty state (Schedules, Lists, Allowed sites) reuses this same template-and-teach moment, so clearing everything returns to onboarding rather than a void.

### 6.2 The schedule editor
One reused component (onboarding Custom, editing, empty-state create). Four blocks, with defaults pre-loaded (weekdays, 09:00–17:00, block page) so a new schedule is one edit from done:
- **Name** — auto-filled, editable.
- **When** — day chips (quick every day / weekdays / weekends) + start/end time, local clock.
- **What** — a single "Block these" area mixing two chip types: **list reference chips** ("Social · 12 sites"; removing *detaches*, doesn't delete; a "used in N schedules" label rides along) and plain **ad-hoc site chips** owned by this schedule. One "+ add" offers both. A **blackout toggle** at the top — *block these sites* vs *block everything except my allowlist* — greys the picker and leans on the global allowlist, making "Deep work" just another schedule.
- **How** — block page (default) or redirect to a URL.

A live plain-English summary line builds as you type (matches the card), and an "overnight — ends next morning" hint appears when the end time precedes the start.

### 6.3 The block moment
The block page names the schedule that caught you, shows the site, shows **when it lifts** (live countdown / "back at 17:00"), in a calm tone that reminds you *you* set this — no shaming. Three escape actions, each a different cost (scaled to the chosen friction level; passphrase level shown):
- **Snooze (5 min)** — type the passphrase once → 5 minutes' access. No cooldown; small and self-reversing.
- **Allow this site permanently** — adds it to the global allowlist (genuine false positives). Friction-gated.
- **End the block early** — type the passphrase once **+ a cooling-off countdown** (~30s default, configurable) stating what turns off and until when, with a "keep me focused / cancel" option during it. The pause is where people reconsider.

In **redirect** mode there's no page to host buttons, so overrides move to the popup. Wellbeing line: friction should help the user honour their own intention, never trap or shame; a real exit always exists — it just costs enough to make you pause.

## 7. Friction & bypass-resistance (honest by design)

No consumer extension can stop itself being disabled at `chrome://extensions`, nor cover other browsers/profiles/Incognito. Friction's job is to defeat the **impulse**, not a sustained choice. **Off by default, opt-in, self-imposed**, with a configurable level (none / short wait / passphrase; passphrase is the strong default given the product's purpose). Mechanisms:

1. **Resume-on-re-enable.** Commitment end-times persist to storage and are re-checked on startup, so toggling the extension off and on **doesn't clear an active lock** — it resumes for the time left. Kills the "flick off, flick on" bypass.
2. **The passphrase = the user's own reason** (D10). Set once in Settings; shown as reference text on the block page (typing-test style with progress); **exact match** (case + punctuation) is the friction; **paste disabled** or the whole thing is theatre; **recursive** — changing it in Settings requires typing the current one, closing the back door.
3. **Flat cost, no escalation** — a paragraph per snooze is already self-limiting.

**Copy stays straight:** a commitment device, not a cage. True lockdown on one's own machine is only possible via enterprise force-install (`ExtensionInstallForcelist`) — a power-user footnote. Anyone needing real enforcement belongs on OS-/router-level tools.

## 8. Matching semantics

- **v1 is domain-level**: a site entry matches its registrable domain + all subdomains.
- **Wildcards** (`*.x.com`) sit behind an "advanced" affordance.
- **Path-level** (`linkedin.com/feed`) and **in-page** (YouTube Shorts vs normal videos) are **deferred** — they need a content script watching client-side route changes and are the fragile part of every competitor.
- **Engine note:** domain-level blocking via `declarativeNetRequest` blocks the *request*, not the rendered page, so it is **SPA-proof**. We only inherit single-page-app complexity if/when we add path/in-page.

## 9. Usage & coaching (local-only, no model)

Two on-device layers; **no LLM, no external data** (D9) — routing browsing behaviour through a model would break the one promise the product is built on.
- **Dashboard** — per-site time, block counts, escape-valve use, focus sessions; stored locally. Plus an optional floating on-page countdown during an active session.
- **Coaching** — each nudge is a **threshold on a local counter + a pre-written template** with the numbers filled in (e.g. `if blockCount(site, schedule, 7d) >= 10 → "{site} pulled you back {n} times during {schedule} this week"` + a one-tap "add a pause"). A dozen such rules cover most of the value; rotate phrasings so it doesn't read robotically.

Discipline: framed around the user's goal, **leads with wins, never a failure count**; tunable (full / wins-only / off); individually dismissible. **Pull, not push** by default — it lives in the Usage tab and waits to be visited; no real-time "you're slipping" popups. Soft progress framing over brittle streak counters (which shame when broken). Generative/conversational coaching is out of scope entirely.

## 10. Privacy & data

**Zero runtime network.** Category lists are **bundled** in the extension and refresh via Web Store releases, so there is no fetch, no network or host permission, and "watch the network tab do nothing" is literally true — unplug the ethernet and it still works (D4/D8). Commitments: all data in `chrome.storage` on-device; no accounts, identifiers, or analytics SDK; minimal permissions (now shorter, with no network); an optional sync that is **Chrome's own profile sync**, never our server; and the real trust lever — **open-source** the extension. Backed by a plain privacy policy (the store needs one regardless) and a one-screen in-app statement linking to the source.

## 11. Feature scope

### 11.1 P0 — MVP ✅
- Schedules (name, days, window, block-page action) with per-schedule blocklist via **ad-hoc sites + reusable user Lists**.
- Domain-level matching; global **allowlist** + blackout toggle; **Focus now**.
- Custom **block page** (states when it lifts).
- `chrome.storage.local`; zero network.

### 11.2 P1 ✅
- **Onboarding** (templates + Custom) and empty-state reuse.
- **Bundled presets** (frozen starters: Social, News, Streaming).
- **Friction stack** (§7): resume-on-re-enable, recursive passphrase, teardown cooldown; configurable level (none / wait / passphrase).
- **Block-moment escape actions** (snooze / allow / end early).
- **Usage dashboard + coaching** (rule-based).
- **Redirect** action; **popup**; **JSON export/import** (own format).
- Optional **cross-Chrome sync** — config-only, last-write-wins.

### 11.3 Future features
See `docs/backlog.md` for the full list of unbuilt features, including items originally scoped as P1 (partial) and P2.

### 11.4 Out of scope
- Mobile sync + apps; OS-level/cross-browser enforcement; truly unbypassable blocking beyond the force-install footnote; server-side analytics/telemetry; **any LLM/generative coaching**; accounts/auth/billing.

## 12. Technical architecture

- **Manifest V3.**
- **Blocking engine — hybrid:** `declarativeNetRequest` dynamic rules for domain-level network blocking + redirect; a `tabs.onUpdated`/`webNavigation` listener evaluates the active schedule/Focus window *at navigation time* and redirects to `blocked.html`. `chrome.alarms` toggles rulesets at window boundaries **and re-evaluates already-open tabs** so a tab on a now-blocked site is cut over, not just the next navigation.
- **Persisted state** (never worker memory, which spins down): schedules, lists, allowlist, settings, commitment/lock end-times, usage counters — all in `chrome.storage`.
- **Storage:** `chrome.storage.local` for everything; optional `chrome.storage.sync` for **config only** (schedules/lists/allowlist/settings — small; bundled lists don't count; usage stays local; last-write-wins; mind ~100KB/8KB-per-item quota).
- **Lists:** bundled assets, no fetch.
- **Permissions (minimal, no network):** `declarativeNetRequest`, `storage`, `alarms`, `tabs`/`webNavigation`, host permissions only as needed (or `activeTab`).
- **No backend.**

## 13. Build-time decisions (deferred — none block starting)

1. **Midnight-crossing windows** — v1, wrap-around evaluation ("is now inside 22:00 → 07:00").
2. **DST** — no special handling; the OS clock covers day-to-day; a window spanning the twice-yearly transition drifts an hour, accepted.
3. **Already-open tabs** — v1; cut over at window boundaries (re-evaluate on the alarm).
4. **Usage attribution mechanics** — active-tab focus, audible tabs, idle detection.
5. **Final block-page copy** and exact override affordances.
6. **Competitor import formats** — research LeechBlock/StayFocusd export schemas (P2).
7. **Distribution** — unpacked first; store later (positioning is "shippable").
8. **Browser targets** — Chrome first; Edge near-free; Firefox has MV3 differences.
9. **Naming / branding.**

## 14. Risks

- **Crowded free market** — SiteBlocker, LeechBlock NG, StayFocusd are already free and good. Differentiate on **provable privacy**, **UX (schedules + lists)**, and **honest, humane friction + local coaching** — not "free" alone.
- **MV3 constraints** — DNR rule limits + ephemeral worker; mitigated by per-navigation evaluation and storage-backed state.
- **Store review** — keep permissions minimal (the no-network posture helps).
- **Promise vs reality** — "blocker" oversells for determined users; mitigated by the honest commitment-device framing (§7).
- **Bundled-list freshness** — category lists are only as current as the last extension release; acceptable trade for zero network, but pick a quality source and ship updates regularly.
- **Coaching tone** — a focus tool that shames defeats itself; keep nudges supportive, win-led, dismissible, pull-only.

## 15. Competitive landscape

### 15.1 FocusGuard (free)
Block sites + subdomains; allowlist; Pomodoro focus mode with work-cycle tracking; password protection; "unstoppable" mode hiding pause/stop; optional funny-image blocked page; manual incognito. Fully local.

### 15.2 BlockSite (freemium — category leader, 1M+ users)
Custom blocklist (free tier ~3–6 sites); adult-content category blocking; schedule mode; Pomodoro; password protection; custom blocked page; uninstall prevention; site redirect; keyword blocking; cross-device sync; insights dashboard; iOS/Android apps. Collects web history. ~$10.99/mo · ~$5.49/mo annual · ~$3.99/mo 3-yr · ~$39.99 lifetime.

### 15.3 LeechBlock NG (free, open source — MPL 2.0; the gold standard)
Up to 30 independent block sets, each with own sites/times/days. Fixed periods, time limits, or both. Lockdown; access control (password/random code); countdown delay; wildcards; whitelist exceptions; keyword block/allow; fully custom block page (HTML+CSS); JSON export/import; keyboard shortcuts; minimum block time. Cross-browser. No paid tier, no data collection. **The feature template.**

### 15.4 StayFocusd (free, ~700–800k users)
Per-site daily time limits; granular blocking (site/subdomain/path/page/in-page content); in-page content blocking; active days/hours; The Nuclear Option (unstoppable block for a period); The Challenge (type a passage to change settings); usage dashboard with history; floating on-page timer; JSON export/import; pairs with StayFree mobile; a "Gen AI Analytics" tab logging AI prompts. Mostly on-device.

### 15.5 Cold Turkey (paid — strict tier)
Desktop app, OS-level enforcement across all browsers and apps; locked blocks (Pro); Pomodoro + breaks; Frozen Turkey (locks the computer); survives restart/reinstall. ~$39 one-time Pro. Out of an extension's reach.

### 15.6 Freedom (paid — cross-device tier)
True cross-device sync (iOS/Android/macOS/Windows/Chrome); recurring sessions; multiple blocklists; Locked Mode; blocks apps + sites. ~$8.99/mo or ~$39.99/yr. Justifies price via mobile + sync backend.

### 15.7 Other friction patterns
DigitalZen (cooldown, friend-verification, money-penalty), FocusMe (Forced Mode), Pluckeye (delay before uninstall), SelfControl (free, macOS, irreversible once started).

### 15.8 Consolidated feature matrix

| Feature | FocusGuard | BlockSite | LeechBlock NG | StayFocusd | Cold Turkey | Freedom |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Unlimited blocklist (free) | ✅ | ❌ (paywall) | ✅ | ✅ | ✅ (Pro) | ✅ (paid) |
| Daily schedule windows | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Per-site time limits | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Allowlist / exceptions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Wildcard / keyword blocking | ❌ | keyword | ✅ both | ❌ | partial | ❌ |
| Custom blocked page | image only | ✅ | ✅ (HTML/CSS) | ❌ | ❌ | ❌ |
| Site redirect | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pomodoro / focus mode | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Commit / "nuclear" lock | partial | partial | lockdown | ✅ | ✅ (strongest) | ✅ |
| Anti-uninstall | ❌ | ✅ (soft) | ❌ | ❌ | ✅ (real, OS) | partial |
| Usage insights | ❌ | ✅ (server) | ❌ | ✅ | ❌ | ✅ |
| Export / import | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cross-device / mobile sync | ❌ | ✅ (paid) | ❌ | via StayFree | ❌ | ✅ (paid) |
| OS-level (all browsers/apps) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (desktop) |
| Data collection | none | web history | none | minimal | minimal | account-based |
| Price | free | freemium | free | free | $39 once | ~$40/yr |

---

## Appendix — Sources

- FocusGuard — Chrome Web Store listing
- BlockSite — Chrome Web Store listing; blocksite.co; third-party pricing reviews (Speechify, CheckThat.ai, SiteBlocker comparison)
- LeechBlock NG — Chrome Web Store / Firefox Add-ons listing; proginosko.com; GitHub (proginosko/LeechBlockNG), MPL 2.0
- StayFocusd — Chrome Web Store listing; stayfocusd.com; MakeUseOf, ProdApps reviews; product screenshots (v4.6.0)
- Cold Turkey — getcoldturkey.com; ProductivityStack, FaithLock, ScreenFine reviews
- Freedom — freedom.to; comparison reviews (FaithLock, ScreenFine)
- Friction patterns — DigitalZen, FocusMe, Pluckeye, SelfControl (alternativeto.net, digitalzen.app)
