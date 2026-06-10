const params = new URLSearchParams(window.location.search);
const domain = params.get('domain') || 'this site';
const scheduleName = params.get('schedule') || 'your schedule';

document.getElementById('domain').textContent = domain;
document.getElementById('schedule-name').textContent = scheduleName;

let settings = {};
let pendingAction = null;

function isScheduleActiveLocal(schedule) {
  if (!schedule.enabled) return false;
  const now = new Date();
  const dayIndex = now.getDay();
  if (schedule.days && schedule.days.length > 0 && !schedule.days.includes(dayIndex)) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = schedule.startTime.split(':').map(Number);
  const [endH, endM] = schedule.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  if (startMinutes <= endMinutes) return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function domainMatchesLocal(urlHostname, blockedDomain) {
  const host = urlHostname.toLowerCase();
  const d = blockedDomain.toLowerCase().replace(/^www\./, '');
  if (host === d || host === 'www.' + d) return true;
  return host.endsWith('.' + d);
}

async function findEndTime() {
  const result = await chrome.storage.local.get('focusBlock');
  const data = result.focusBlock;
  if (!data) return null;
  const now = new Date();

  if (data.focusSession && data.focusSession.endTime > now.getTime()) {
    return new Date(data.focusSession.endTime);
  }

  for (const schedule of data.schedules || []) {
    if (!isScheduleActiveLocal(schedule)) continue;
    const adHocSites = (schedule.adHocSites || []).map(s => s.toLowerCase().replace(/^www\./, ''));
    const listSites = (schedule.listIds || []).flatMap(listId => {
      const list = (data.lists || []).find(l => l.id === listId);
      return list ? list.sites.map(s => s.toLowerCase().replace(/^www\./, '')) : [];
    });
    const allSites = [...adHocSites, ...listSites];
    if (!schedule.blackout && !allSites.some(s => domainMatchesLocal(domain, s))) continue;

    const [endH, endM] = schedule.endTime.split(':').map(Number);
    const endDate = new Date(now);
    endDate.setHours(endH, endM, 0, 0);
    const [startH, startM] = schedule.startTime.split(':').map(Number);
    if ((endH * 60 + endM) <= (startH * 60 + startM) && now.getHours() * 60 + now.getMinutes() >= startH * 60 + startM) {
      endDate.setDate(endDate.getDate() + 1);
    }
    if (endDate > now) return endDate;
  }
  return null;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'any moment now';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

let endTime = null;

async function initCountdown() {
  endTime = await findEndTime();
  updateCountdown();
}

function updateCountdown() {
  const el = document.getElementById('countdown');
  if (!endTime) {
    el.textContent = 'while the schedule is active';
    return;
  }
  const remaining = endTime.getTime() - Date.now();
  if (remaining <= 0) {
    el.textContent = 'now — redirecting…';
    setTimeout(() => { window.location.href = 'https://' + domain; }, 1500);
    return;
  }
  el.textContent = `${formatCountdown(remaining)} · at ${formatTime(endTime)}`;
  setTimeout(updateCountdown, 1000);
}

// ─── Escape Actions ───

async function loadSettings() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'getSettings' }, (resp) => {
      settings = (resp && resp.settings) || {};
      resolve();
    });
  });
}

function showEscapeActions() {
  document.getElementById('escape-actions').style.display = 'flex';
}

function hideAll() {
  document.getElementById('escape-actions').style.display = 'none';
  document.getElementById('passphrase-challenge').style.display = 'none';
  document.getElementById('cooldown-section').style.display = 'none';
}

function requirePassphrase(action) {
  if (settings.frictionLevel === 'none' || (!settings.passphrase && settings.frictionLevel !== 'wait')) {
    executeAction(action);
    return;
  }
  if (settings.frictionLevel === 'wait') {
    hideAll();
    const section = document.getElementById('cooldown-section');
    const warning = document.getElementById('cooldown-warning');
    const timer = document.getElementById('cooldown-timer');
    const confirmBtn = document.getElementById('btn-confirm-end');
    warning.textContent = 'Take a moment to reconsider...';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.4';
    confirmBtn.textContent = 'Continue';
    section.style.display = 'block';
    let remaining = 5;
    timer.textContent = remaining;
    const interval = setInterval(() => {
      remaining--;
      timer.textContent = remaining > 0 ? remaining : 'Ready';
      if (remaining <= 0) {
        clearInterval(interval);
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.onclick = () => { executeAction(action); };
      }
    }, 1000);
    document.getElementById('btn-cancel-cooldown').onclick = () => {
      clearInterval(interval);
      hideAll();
      showEscapeActions();
    };
    return;
  }
  pendingAction = action;
  hideAll();
  document.getElementById('passphrase-reference').textContent = `"${settings.passphrase}"`;
  document.getElementById('passphrase-input').value = '';
  document.getElementById('passphrase-bar').style.width = '0%';
  document.getElementById('passphrase-challenge').style.display = 'block';
  document.getElementById('passphrase-input').focus();
}

function executeAction(action) {
  if (action === 'snooze') {
    chrome.runtime.sendMessage({ type: 'snooze', domain }, (resp) => {
      if (resp && resp.success) {
        window.location.href = 'https://' + domain;
      }
    });
  } else if (action === 'allow') {
    chrome.runtime.sendMessage({ type: 'allowPermanently', domain }, (resp) => {
      if (resp && resp.success) {
        window.location.href = 'https://' + domain;
      }
    });
  } else if (action === 'endEarly') {
    startCooldown();
  }
}

// Passphrase input — typing test with progress bar, paste disabled
const passphraseInput = document.getElementById('passphrase-input');

passphraseInput.addEventListener('paste', (e) => e.preventDefault());

passphraseInput.addEventListener('input', () => {
  if (!settings.passphrase) return;
  const typed = passphraseInput.value;
  const target = settings.passphrase;
  const progress = Math.min(typed.length / target.length, 1);
  document.getElementById('passphrase-bar').style.width = `${progress * 100}%`;

  if (typed === target) {
    executeAction(pendingAction);
    pendingAction = null;
  }
});

document.getElementById('btn-cancel-challenge').addEventListener('click', () => {
  hideAll();
  showEscapeActions();
  pendingAction = null;
});

// Cooldown for "end block early"
function startCooldown() {
  hideAll();
  const cooldownSec = settings.cooldownSeconds || 30;
  const section = document.getElementById('cooldown-section');
  const warning = document.getElementById('cooldown-warning');
  const timer = document.getElementById('cooldown-timer');
  const confirmBtn = document.getElementById('btn-confirm-end');

  warning.textContent = `This will end the "${scheduleName}" block until its next scheduled window. You'll have unrestricted access to ${domain}.`;
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '0.4';
  section.style.display = 'block';

  let remaining = cooldownSec;
  timer.textContent = remaining;

  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      timer.textContent = 'Ready';
    } else {
      timer.textContent = remaining;
    }
  }, 1000);
}

document.getElementById('btn-confirm-end').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'endBlockEarly', domain }, (resp) => {
    if (resp && resp.success) {
      window.location.href = 'https://' + domain;
    }
  });
});

document.getElementById('btn-cancel-cooldown').addEventListener('click', () => {
  hideAll();
  showEscapeActions();
});

// Snooze
document.getElementById('btn-snooze').addEventListener('click', () => requirePassphrase('snooze'));
// Allow permanently
document.getElementById('btn-allow').addEventListener('click', () => requirePassphrase('allow'));
// End early
document.getElementById('btn-end-early').addEventListener('click', () => requirePassphrase('endEarly'));

// Go back
document.getElementById('go-back').addEventListener('click', () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    chrome.tabs.getCurrent(tab => {
      if (tab) chrome.tabs.update(tab.id, { url: 'chrome://newtab' });
    });
  }
});

// Init
async function init() {
  await loadSettings();
  showEscapeActions();
  initCountdown();
}

init();
