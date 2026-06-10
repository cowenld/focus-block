importScripts('storage.js', 'matching.js', 'schedule-engine.js');

const ALARM_NAME = 'focusblock-check';
const DNR_RULE_START_ID = 1;
let isUpdatingRules = false;

async function updateBlockingRules() {
  isUpdatingRules = true;
  try {
    const [schedules, lists, allowlistEntries, focusSession] = await Promise.all([
      getSchedules(), getLists(), getAllowlist(), getFocusSession()
    ]);

    const result = getActiveBlockedDomains(schedules, lists, allowlistEntries, focusSession);
    const rules = [];
    let ruleId = DNR_RULE_START_ID;

    if (result.blackout) {
      await chrome.storage.local.set({
        _blockState: {
          blackout: true,
          allowlist: result.allowlist,
          scheduleName: result.scheduleName,
          domains: []
        }
      });
    } else {
      // Filter out allowlisted and snoozed domains
      const data = await getData();
      const snoozeUntil = data._snoozeUntil || {};
      const now2 = Date.now();
      const filteredDomains = result.domains.filter(d =>
        !allowlistEntries.some(a => domainMatches(d, a)) &&
        !(snoozeUntil[d] && snoozeUntil[d] > now2)
      );

      const domainScheduleMap = {};
      const now = new Date();
      for (const schedule of schedules) {
        if (!isScheduleActive(schedule, now)) continue;
        const effective = getEffectiveBlocklist(schedule, lists);
        for (const d of effective) {
          if (!domainScheduleMap[d]) domainScheduleMap[d] = schedule.name;
        }
      }
      if (focusSession && focusSession.endTime > now.getTime()) {
        for (const d of (focusSession.domains || [])) {
          if (!domainScheduleMap[d]) domainScheduleMap[d] = 'Focus Now';
        }
      }

      // Build redirect schedule map for redirect-action schedules
      const domainRedirectMap = {};
      for (const schedule of schedules) {
        if (!isScheduleActive(schedule, now)) continue;
        if (schedule.action === 'redirect' && schedule.redirectUrl) {
          const effective = getEffectiveBlocklist(schedule, lists);
          for (const d of effective) {
            if (!domainRedirectMap[d]) domainRedirectMap[d] = schedule.redirectUrl;
          }
        }
      }

      for (const domain of filteredDomains) {
        const sName = domainScheduleMap[domain] || '';
        const redirectUrl = domainRedirectMap[domain];
        const ruleAction = redirectUrl
          ? { type: 'redirect', redirect: { url: redirectUrl } }
          : { type: 'redirect', redirect: { extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}&schedule=${encodeURIComponent(sName)}` } };

        rules.push({
          id: ruleId++,
          priority: 1,
          action: ruleAction,
          condition: {
            urlFilter: `||${domain}`,
            resourceTypes: ['main_frame']
          }
        });
      }

      await chrome.storage.local.set({
        _blockState: {
          blackout: false,
          allowlist: allowlistEntries,
          domains: filteredDomains,
          scheduleName: ''
        }
      });
    }

    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existingRules.map(r => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: rules
    });
  } finally {
    isUpdatingRules = false;
  }
}

async function checkAndRedirectTab(tabId, url) {
  const state = (await chrome.storage.local.get('_blockState'))._blockState;
  if (!state) return;

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }

  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  let shouldBlock = false;
  let scheduleName = state.scheduleName || '';

  if (state.blackout) {
    const isAllowed = state.allowlist.some(d => domainMatches(hostname, d));
    if (!isAllowed) {
      shouldBlock = true;
      scheduleName = state.scheduleName || 'Blackout';
    }
  } else {
    for (const domain of state.domains) {
      if (domainMatches(hostname, domain)) {
        shouldBlock = true;
        break;
      }
    }
  }

  if (shouldBlock) {
    const schedules = await getSchedules();
    const lists = await getLists();
    const now = new Date();

    for (const schedule of schedules) {
      if (!isScheduleActive(schedule, now)) continue;
      const effective = getEffectiveBlocklist(schedule, lists);
      if (effective.some(d => domainMatches(hostname, d)) || schedule.blackout) {
        scheduleName = schedule.name;
        break;
      }
    }

    const focusSession = await getFocusSession();
    if (focusSession && focusSession.endTime > now.getTime()) {
      scheduleName = 'Focus Now';
    }

    const blockedUrl = chrome.runtime.getURL(
      `blocked.html?domain=${encodeURIComponent(hostname)}&schedule=${encodeURIComponent(scheduleName)}`
    );
    chrome.tabs.update(tabId, { url: blockedUrl });
  }
}

async function recheckAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url) {
      await checkAndRedirectTab(tab.id, tab.url);
    }
  }
}

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  await checkAndRedirectTab(details.tabId, details.url);
});

// C1 fix: record blocks via onBeforeNavigate (fires before DNR redirect)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;
  let hostname;
  try { hostname = new URL(url).hostname; } catch { return; }

  const state = (await chrome.storage.local.get('_blockState'))._blockState;
  if (!state) return;

  if (state.blackout) {
    const isAllowed = state.allowlist.some(d => domainMatches(hostname, d));
    if (!isAllowed) await recordBlock(hostname, state.scheduleName || 'Blackout');
  } else if (state.domains) {
    for (const domain of state.domains) {
      if (domainMatches(hostname, domain)) {
        await recordBlock(hostname, '');
        break;
      }
    }
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await updateBlockingRules();
    await recheckAllTabs();
    scheduleNextAlarm();
  } else if (alarm.name === 'focusblock-focus-end') {
    await clearFocusSession();
    await updateBlockingRules();
    await recheckAllTabs();
  } else if (alarm.name.startsWith('snooze-end-')) {
    const domain = alarm.name.replace('snooze-end-', '');
    const data = await getData();
    if (data._snoozeUntil) {
      delete data._snoozeUntil[domain];
      await setData(data);
    }
    await updateBlockingRules();
    await recheckAllTabs();
  }
});

async function scheduleNextAlarm() {
  const schedules = await getSchedules();
  const minutes = getNextWindowBoundary(schedules);
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: Math.max(1, minutes) });
}

// C3 fix: guard against re-entrant updates from our own writes
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.focusBlock && !isUpdatingRules) {
    await updateBlockingRules();
    scheduleNextAlarm();
  }

  // Sync read-back: config changed on another Chrome profile
  if (area === 'sync' && changes.focusBlockSync && changes.focusBlockSync.newValue) {
    const settings = await getSettings();
    if (!settings.syncEnabled) return;
    // Last-write-wins guard inside applySyncedConfig also skips our own
    // writes echoing back (their updatedAt equals local updatedAt).
    isUpdatingRules = true;
    let applied = false;
    try {
      applied = await applySyncedConfig(changes.focusBlockSync.newValue);
    } finally {
      isUpdatingRules = false;
    }
    if (applied) {
      await updateBlockingRules();
      await recheckAllTabs();
      scheduleNextAlarm();
    }
  }
});

// Pull synced config on browser/extension startup (catches changes made
// on other profiles while this one wasn't running).
async function pullSyncedConfig() {
  const settings = await getSettings();
  if (!settings.syncEnabled) return;
  try {
    const res = await chrome.storage.sync.get('focusBlockSync');
    if (res.focusBlockSync) {
      await applySyncedConfig(res.focusBlockSync);
    }
  } catch { /* sync unavailable */ }
}

// C2 fix: wrap all async message handlers with error handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getBlockStatus') {
    (async () => {
      const state = (await chrome.storage.local.get('_blockState'))._blockState;
      sendResponse({ state });
    })().catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'startFocus') {
    (async () => {
      const session = {
        startTime: Date.now(),
        endTime: Date.now() + (message.duration * 60 * 1000),
        blackout: message.blackout || false,
        domains: message.domains || []
      };
      await saveFocusSession(session);
      chrome.alarms.create('focusblock-focus-end', {
        delayInMinutes: message.duration
      });
      await updateBlockingRules();
      await recheckAllTabs();
      sendResponse({ success: true });
    })().catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'endFocus') {
    (async () => {
      await clearFocusSession();
      chrome.alarms.clear('focusblock-focus-end');
      await updateBlockingRules();
      await recheckAllTabs();
      sendResponse({ success: true });
    })().catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'refreshRules') {
    (async () => {
      await updateBlockingRules();
      await recheckAllTabs();
      sendResponse({ success: true });
    })().catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'snooze') {
    (async () => {
      const settings = await getSettings();
      const minutes = settings.snoozeDurationMinutes || 5;
      const data = await getData();
      if (!data._snoozeUntil) data._snoozeUntil = {};
      data._snoozeUntil[message.domain] = Date.now() + (minutes * 60 * 1000);
      await setData(data);
      await recordEscape(message.domain, 'snooze');
      chrome.alarms.create(`snooze-end-${message.domain}`, { delayInMinutes: minutes });
      await updateBlockingRules();
      sendResponse({ success: true, minutes });
    })().catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'allowPermanently') {
    (async () => {
      const allowlist = await getAllowlist();
      if (!allowlist.includes(message.domain)) {
        allowlist.push(message.domain);
        await saveAllowlist(allowlist);
      }
      await recordEscape(message.domain, 'allow');
      await updateBlockingRules();
      sendResponse({ success: true });
    })().catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'endBlockEarly') {
    (async () => {
      isUpdatingRules = true;
      try {
        const schedules = await getSchedules();
        const lists = await getLists();
        const now = new Date();
        for (const schedule of schedules) {
          if (!isScheduleActive(schedule, now)) continue;
          const effective = getEffectiveBlocklist(schedule, lists);
          if (effective.some(d => domainMatches(message.domain, d)) || schedule.blackout) {
            schedule.enabled = false;
            await saveSchedule(schedule);
          // Store commitment end time so resume-on-re-enable works
          const [endH, endM] = schedule.endTime.split(':').map(Number);
          const endDate = new Date(now);
          endDate.setHours(endH, endM, 0, 0);
          if (endDate <= now) endDate.setDate(endDate.getDate() + 1);
          await setCommitmentEndTime(schedule.id, endDate.getTime());
        }
      }
        await recordEscape(message.domain, 'endEarly');
      } finally {
        isUpdatingRules = false;
      }
      await updateBlockingRules();
      await recheckAllTabs();
      sendResponse({ success: true });
    })().catch(err => { isUpdatingRules = false; sendResponse({ error: err.message }); });
    return true;
  }
  if (message.type === 'getSettings') {
    (async () => {
      const settings = await getSettings();
      sendResponse({ settings });
    })().catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

// Resume-on-re-enable: check commitment end times on startup
async function checkCommitmentEndTimes() {
  const endTimes = await getCommitmentEndTimes();
  const schedules = await getSchedules();
  const now = Date.now();
  for (const schedule of schedules) {
    const commitEnd = endTimes[schedule.id];
    if (commitEnd && commitEnd > now && !schedule.enabled) {
      schedule.enabled = true;
      await saveSchedule(schedule);
      await clearCommitmentEndTime(schedule.id);
    } else if (commitEnd && commitEnd <= now) {
      await clearCommitmentEndTime(schedule.id);
    }
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await getData();
  await pullSyncedConfig();
  await checkCommitmentEndTimes();
  await updateBlockingRules();
  scheduleNextAlarm();
  if (details.reason === 'install') {
    const settings = await getSettings();
    if (!settings.onboardingComplete) {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await pullSyncedConfig();
  await checkCommitmentEndTimes();
  await updateBlockingRules();
  scheduleNextAlarm();
});
