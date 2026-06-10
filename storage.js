const DEFAULT_DATA = {
  schedules: [],
  lists: [],
  allowlist: [],
  settings: {
    frictionLevel: 'none',
    passphrase: '',
    theme: 'system',
    syncEnabled: false
  },
  focusSession: null,
  usage: {
    blockCounts: {},
    escapeCounts: {}
  }
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function getData() {
  const result = await chrome.storage.local.get('focusBlock');
  if (!result.focusBlock) {
    await chrome.storage.local.set({ focusBlock: DEFAULT_DATA });
    return structuredClone(DEFAULT_DATA);
  }
  return result.focusBlock;
}

async function setData(data) {
  await chrome.storage.local.set({ focusBlock: data });
}

async function getSchedules() {
  const data = await getData();
  return data.schedules;
}

async function saveSchedule(schedule) {
  const data = await getData();
  if (!schedule.id) {
    schedule.id = generateId();
    data.schedules.push(schedule);
  } else {
    const idx = data.schedules.findIndex(s => s.id === schedule.id);
    if (idx >= 0) data.schedules[idx] = schedule;
    else data.schedules.push(schedule);
  }
  await setData(data);
  return schedule;
}

async function deleteSchedule(id) {
  const data = await getData();
  data.schedules = data.schedules.filter(s => s.id !== id);
  await setData(data);
}

async function getLists() {
  const data = await getData();
  return data.lists;
}

async function saveList(list) {
  const data = await getData();
  if (!list.id) {
    list.id = generateId();
    data.lists.push(list);
  } else {
    const idx = data.lists.findIndex(l => l.id === list.id);
    if (idx >= 0) data.lists[idx] = list;
    else data.lists.push(list);
  }
  await setData(data);
  return list;
}

async function deleteList(id) {
  const data = await getData();
  data.lists = data.lists.filter(l => l.id !== id);
  await setData(data);
}

async function getAllowlist() {
  const data = await getData();
  return data.allowlist;
}

async function saveAllowlist(allowlist) {
  const data = await getData();
  data.allowlist = allowlist;
  await setData(data);
}

async function getSettings() {
  const data = await getData();
  return data.settings;
}

async function saveSettings(settings) {
  const data = await getData();
  data.settings = { ...data.settings, ...settings };
  await setData(data);
}

async function getFocusSession() {
  const data = await getData();
  return data.focusSession;
}

async function saveFocusSession(session) {
  const data = await getData();
  data.focusSession = session;
  await setData(data);
}

async function clearFocusSession() {
  const data = await getData();
  data.focusSession = null;
  await setData(data);
}
