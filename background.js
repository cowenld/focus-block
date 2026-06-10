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
      // C1 fix: filter out allowlisted domains before creating DNR rules
      const filteredDomains = result.domains.filter(d =>
        !allowlistEntries.some(a => domainMatches(d, a))
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

      for (const domain of filteredDomains) {
        const sName = domainScheduleMap[domain] || '';
        rules.push({
          id: ruleId++,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}&schedule=${encodeURIComponent(sName)}`
            }
          },
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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await updateBlockingRules();
    await recheckAllTabs();
    scheduleNextAlarm();
  }
  if (alarm.name === 'focusblock-focus-end') {
    await clearFocusSession();
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
});

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
});

chrome.runtime.onInstalled.addListener(async () => {
  await getData();
  await updateBlockingRules();
  scheduleNextAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await updateBlockingRules();
  scheduleNextAlarm();
});
