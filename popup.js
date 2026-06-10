// Open settings
document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ─── Status ───

async function updateStatus() {
  const [schedules, lists, allowlist, focusSession] = await Promise.all([
    getSchedules(), getLists(), getAllowlist(), getFocusSession()
  ]);

  const result = getActiveBlockedDomains(schedules, lists, allowlist, focusSession);
  const container = document.getElementById('current-status');

  if (result.blackout) {
    container.innerHTML = `
      <div class="status-card">
        <div class="status-active">🛡️ Blocking active</div>
        <div class="status-detail">Blackout mode via ${esc(result.scheduleName)} — only allowed sites are reachable</div>
      </div>`;
  } else if (result.domains && result.domains.length > 0) {
    const activeSchedules = schedules.filter(s => isScheduleActive(s));
    const names = activeSchedules.map(s => s.name).join(', ');
    container.innerHTML = `
      <div class="status-card">
        <div class="status-active">🛡️ Blocking active</div>
        <div class="status-detail">${result.domains.length} site${result.domains.length !== 1 ? 's' : ''} blocked${names ? ' · ' + esc(names) : ''}</div>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="status-card">
        <div class="status-inactive">No active blocks right now</div>
      </div>`;
  }

  // Focus session
  const focusActive = document.getElementById('focus-active');
  const focusStart = document.getElementById('focus-start');

  if (focusSession && focusSession.endTime > Date.now()) {
    focusActive.style.display = 'block';
    focusStart.style.display = 'none';
    updateFocusTimer(focusSession.endTime);
  } else {
    focusActive.style.display = 'none';
    focusStart.style.display = 'block';
  }
}

function updateFocusTimer(endTime) {
  const remaining = endTime - Date.now();
  if (remaining <= 0) {
    document.getElementById('focus-timer').textContent = 'ending…';
    setTimeout(updateStatus, 1000);
    return;
  }
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  document.getElementById('focus-timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  setTimeout(() => updateFocusTimer(endTime), 1000);
}

// ─── Focus Now ───

document.querySelectorAll('.btn-focus').forEach(btn => {
  btn.addEventListener('click', async () => {
    const minutes = Number(btn.dataset.minutes);
    const blackout = document.getElementById('focus-blackout').checked;

    // Collect all currently blocked domains from schedules
    const [schedules, lists] = await Promise.all([getSchedules(), getLists()]);
    const domains = new Set();
    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      const effective = getEffectiveBlocklist(schedule, lists);
      for (const d of effective) domains.add(d);
    }

    chrome.runtime.sendMessage({
      type: 'startFocus',
      duration: minutes,
      blackout,
      domains: [...domains]
    }, () => {
      updateStatus();
    });
  });
});

document.getElementById('end-focus').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'endFocus' }, () => {
    updateStatus();
  });
});

// ─── Quick Block (current tab) ───

async function updateCurrentSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const container = document.getElementById('current-site-info');

  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    container.innerHTML = '<span style="color:#999">No blockable site on this tab</span>';
    return;
  }

  let hostname;
  try {
    hostname = new URL(tab.url).hostname.replace(/^www\./, '');
  } catch {
    container.innerHTML = '<span style="color:#999">No blockable site on this tab</span>';
    return;
  }

  const [schedules, lists, allowlist] = await Promise.all([
    getSchedules(), getLists(), getAllowlist()
  ]);

  const isAllowed = allowlist.some(d => domainMatches(hostname, d));
  const isBlocked = !isAllowed && schedules.some(s => {
    if (!isScheduleActive(s)) return false;
    const effective = getEffectiveBlocklist(s, lists);
    return effective.some(d => domainMatches(hostname, d));
  });

  if (isAllowed) {
    container.innerHTML = `
      <div class="current-site-domain">${esc(hostname)}</div>
      <span style="color:#888;font-size:12px">On your allowlist</span>`;
  } else if (isBlocked) {
    container.innerHTML = `
      <div class="current-site-domain">${esc(hostname)}</div>
      <span style="color:#c44;font-size:12px">Currently blocked</span>`;
  } else {
    container.innerHTML = `
      <div class="current-site-domain">${esc(hostname)}</div>
      <button class="btn btn-block" id="quick-block-btn">Block ${esc(hostname)}</button>`;

    document.getElementById('quick-block-btn').addEventListener('click', async () => {
      // I6 fix: use a dedicated always-on "Quick blocks" schedule
      const allSchedules = await getSchedules();
      let targetSchedule = allSchedules.find(s => s.name === 'Quick blocks');
      if (!targetSchedule) {
        targetSchedule = {
          name: 'Quick blocks',
          days: [0, 1, 2, 3, 4, 5, 6],
          startTime: '00:00',
          endTime: '23:59',
          blackout: false,
          adHocSites: [],
          listIds: [],
          enabled: true
        };
      }

      if (!targetSchedule.adHocSites) targetSchedule.adHocSites = [];
      if (!targetSchedule.adHocSites.includes(hostname)) {
        targetSchedule.adHocSites.push(hostname);
        await saveSchedule(targetSchedule);
        chrome.runtime.sendMessage({ type: 'refreshRules' });
        updateCurrentSite();
        updateStatus();
      }
    });
  }
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Init
updateStatus();
updateCurrentSite();
