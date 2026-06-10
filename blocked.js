const params = new URLSearchParams(window.location.search);
const domain = params.get('domain') || 'this site';
const scheduleName = params.get('schedule') || 'your schedule';

document.getElementById('domain').textContent = domain;
document.getElementById('schedule-name').textContent = scheduleName;

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

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function domainMatchesLocal(urlHostname, blockedDomain) {
  const host = urlHostname.toLowerCase();
  const d = blockedDomain.toLowerCase().replace(/^www\./, '');
  if (host === d || host === 'www.' + d) return true;
  if (host.endsWith('.' + d)) return true;
  return false;
}

async function findEndTime() {
  const result = await chrome.storage.local.get('focusBlock');
  const data = result.focusBlock;
  if (!data) return null;

  const now = new Date();

  if (data.focusSession && data.focusSession.endTime > now.getTime()) {
    return new Date(data.focusSession.endTime);
  }

  // I5 fix: find the schedule that's active NOW and actually blocks this domain
  for (const schedule of data.schedules || []) {
    if (!isScheduleActiveLocal(schedule)) continue;

    const adHocSites = (schedule.adHocSites || []).map(s => s.toLowerCase().replace(/^www\./, ''));
    const listSites = (schedule.listIds || []).flatMap(listId => {
      const list = (data.lists || []).find(l => l.id === listId);
      return list ? list.sites.map(s => s.toLowerCase().replace(/^www\./, '')) : [];
    });
    const allSites = [...adHocSites, ...listSites];

    const matchesDomain = schedule.blackout || allSites.some(s => domainMatchesLocal(domain, s));
    if (!matchesDomain) continue;

    const [endH, endM] = schedule.endTime.split(':').map(Number);
    const endDate = new Date(now);
    endDate.setHours(endH, endM, 0, 0);

    const [startH, startM] = schedule.startTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    if (endMinutes <= startMinutes && now.getHours() * 60 + now.getMinutes() >= startMinutes) {
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
    // M3 fix: navigate to the originally-blocked domain instead of history.back()
    el.textContent = 'now — redirecting…';
    setTimeout(() => {
      window.location.href = 'https://' + domain;
    }, 1500);
    return;
  }

  el.textContent = `${formatCountdown(remaining)} · at ${formatTime(endTime)}`;
  // I4 fix: use setTimeout(1s) instead of requestAnimationFrame(60fps)
  setTimeout(updateCountdown, 1000);
}

document.getElementById('go-back').addEventListener('click', () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    chrome.tabs.getCurrent(tab => {
      if (tab) chrome.tabs.update(tab.id, { url: 'chrome://newtab' });
    });
  }
});

initCountdown();
