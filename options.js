// Tab navigation
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ─── State ───

let editingScheduleId = null;
let editingListId = null;
let modalSites = [];
let modalListIds = [];
let listModalSites = [];

// ─── Schedules ───

async function renderSchedules() {
  const schedules = await getSchedules();
  const lists = await getLists();
  const container = document.getElementById('schedules-list');
  const empty = document.getElementById('schedules-empty');

  if (schedules.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  container.style.display = 'flex';
  empty.style.display = 'none';

  // Event delegation for schedule cards
  container.onclick = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') editSchedule(id);
    else if (btn.dataset.action === 'delete') removeSchedule(id);
  };
  container.onchange = (e) => {
    const input = e.target.closest('[data-action="toggle"]');
    if (input) toggleSchedule(input.dataset.id, input.checked);
  };

  container.innerHTML = schedules.map(s => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = (s.days || []).map(d => dayNames[d]).join(', ') || 'Every day';
    const siteCount = (s.adHocSites || []).length;
    const listCount = (s.listIds || []).length;
    const listNames = (s.listIds || []).map(id => {
      const list = lists.find(l => l.id === id);
      return list ? list.name : '?';
    });

    let sitesDesc = '';
    if (s.blackout) {
      sitesDesc = 'Everything except allowed sites';
    } else {
      const parts = [];
      if (siteCount > 0) parts.push(`${siteCount} site${siteCount !== 1 ? 's' : ''}`);
      if (listCount > 0) parts.push(listNames.map(n => esc(n)).join(', '));
      sitesDesc = parts.join(' + ') || 'No sites';
    }

    const escapedId = esc(s.id);
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${esc(s.name)}</span>
          <div class="card-actions">
            <button class="icon-btn" data-action="edit" data-id="${escapedId}" title="Edit">${icon('pencil')}</button>
            <button class="icon-btn" data-action="delete" data-id="${escapedId}" title="Delete">${icon('trash')}</button>
            <label class="toggle">
              <input type="checkbox" ${s.enabled ? 'checked' : ''} data-action="toggle" data-id="${escapedId}">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="card-subtitle">${days} · ${s.startTime}–${s.endTime} · ${s.action === 'redirect' ? 'redirect' : 'block page'} · ${sitesDesc}</div>
      </div>
    `;
  }).join('');
}

window.toggleSchedule = async function(id, enabled) {
  const schedules = await getSchedules();
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return;

  if (!enabled && isScheduleActive(schedule)) {
    const settings = await getSettings();
    const frictionLevel = settings.frictionLevel || 'passphrase';

    if (frictionLevel === 'passphrase' && settings.passphrase) {
      const typed = prompt('Type your commitment phrase to disable this schedule:');
      if (typed !== settings.passphrase) {
        const checkbox = document.querySelector(`[data-action="toggle"][data-id="${CSS.escape(id)}"]`);
        if (checkbox) checkbox.checked = true;
        return;
      }
    } else if (frictionLevel === 'wait') {
      if (!confirm('This schedule is currently active. Disabling it will unblock sites immediately. Continue?')) {
        const checkbox = document.querySelector(`[data-action="toggle"][data-id="${CSS.escape(id)}"]`);
        if (checkbox) checkbox.checked = true;
        return;
      }
    }
  }

  schedule.enabled = enabled;
  await saveSchedule(schedule);
  chrome.runtime.sendMessage({ type: 'refreshRules' });
};

window.removeSchedule = async function(id) {
  if (!confirm('Delete this schedule?')) return;
  await deleteSchedule(id);
  chrome.runtime.sendMessage({ type: 'refreshRules' });
  renderSchedules();
};

window.editSchedule = async function(id) {
  const schedules = await getSchedules();
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return;
  openScheduleModal(schedule);
};

// ─── Schedule Modal ───

function openScheduleModal(schedule) {
  editingScheduleId = schedule ? schedule.id : null;
  document.getElementById('modal-title').textContent = schedule ? 'Edit schedule' : 'New schedule';
  document.getElementById('sched-name').value = schedule ? schedule.name : '';

  const days = schedule ? (schedule.days || []) : [1, 2, 3, 4, 5];
  document.querySelectorAll('.day-chip').forEach(chip => {
    chip.classList.toggle('active', days.includes(Number(chip.dataset.day)));
  });

  document.getElementById('sched-start').value = schedule ? schedule.startTime : '09:00';
  document.getElementById('sched-end').value = schedule ? schedule.endTime : '17:00';
  document.getElementById('sched-blackout').checked = schedule ? schedule.blackout : false;

  modalSites = schedule ? [...(schedule.adHocSites || [])] : [];
  modalListIds = schedule ? [...(schedule.listIds || [])] : [];

  // Action (block page vs redirect)
  const action = schedule ? (schedule.action || 'block') : 'block';
  document.querySelectorAll('input[name="sched-action"]').forEach(r => {
    r.checked = r.value === action;
  });
  document.getElementById('sched-redirect-url').value = schedule ? (schedule.redirectUrl || '') : '';
  document.getElementById('redirect-url-section').style.display = action === 'redirect' ? 'block' : 'none';

  renderModalSites();
  renderModalListChips();
  updateSummary();
  updateOvernightHint();
  toggleBlackoutUI();
  document.getElementById('schedule-modal').style.display = 'flex';
}

function closeScheduleModal() {
  document.getElementById('schedule-modal').style.display = 'none';
  editingScheduleId = null;
  modalSites = [];
  modalListIds = [];
}

function renderModalSites() {
  const container = document.getElementById('sched-site-chips');
  container.innerHTML = modalSites.map((site, i) => `
    <span class="chip">${esc(site)}<button class="chip-remove" onclick="removeModalSite(${i})">&times;</button></span>
  `).join('');
}

window.removeModalSite = function(i) {
  modalSites.splice(i, 1);
  renderModalSites();
  updateSummary();
};

async function renderModalListChips() {
  const allLists = await getLists();
  const container = document.getElementById('sched-list-chips');

  const attached = modalListIds.map(id => allLists.find(l => l.id === id)).filter(Boolean);
  const available = allLists.filter(l => !modalListIds.includes(l.id));

  let html = attached.map(l => `
    <span class="chip chip-list-ref">${esc(l.name)} · ${l.sites.length} sites<button class="chip-remove" onclick="detachList('${l.id}')">&times;</button></span>
  `).join('');

  if (available.length > 0) {
    html += `<select class="input" style="width:auto;padding:4px 8px;font-size:13px" onchange="attachList(this.value);this.selectedIndex=0">
      <option value="">+ attach list</option>
      ${available.map(l => `<option value="${l.id}">${esc(l.name)} (${l.sites.length})</option>`).join('')}
    </select>`;
  }

  container.innerHTML = html;
}

window.detachList = function(id) {
  modalListIds = modalListIds.filter(lid => lid !== id);
  renderModalListChips();
  updateSummary();
};

window.attachList = function(id) {
  if (id && !modalListIds.includes(id)) {
    modalListIds.push(id);
    renderModalListChips();
    updateSummary();
  }
};

function toggleBlackoutUI() {
  const isBlackout = document.getElementById('sched-blackout').checked;
  document.getElementById('sched-sites-section').style.display = isBlackout ? 'none' : 'block';
}

function updateOvernightHint() {
  const start = document.getElementById('sched-start').value;
  const end = document.getElementById('sched-end').value;
  const hint = document.getElementById('overnight-hint');
  if (start && end) {
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    hint.style.display = (eH * 60 + eM) <= (sH * 60 + sM) ? 'block' : 'none';
  }
}

function updateSummary() {
  const name = document.getElementById('sched-name').value || 'Untitled';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const activeDays = [...document.querySelectorAll('.day-chip.active')].map(c => dayNames[Number(c.dataset.day)]);
  const start = document.getElementById('sched-start').value || '09:00';
  const end = document.getElementById('sched-end').value || '17:00';
  const isBlackout = document.getElementById('sched-blackout').checked;

  const daysStr = activeDays.length === 7 ? 'Every day' :
    activeDays.length === 5 && [1,2,3,4,5].every(d => document.querySelector(`.day-chip[data-day="${d}"]`).classList.contains('active')) ? 'Weekdays' :
    activeDays.join(', ') || 'No days';

  const what = isBlackout ? 'block everything except allowed sites' :
    `block ${modalSites.length + modalListIds.length} item${modalSites.length + modalListIds.length !== 1 ? 's' : ''}`;

  document.getElementById('sched-summary').textContent = `${name} · ${daysStr} · ${start}–${end} · ${what}`;
}

async function saveCurrentSchedule() {
  const name = document.getElementById('sched-name').value.trim() || 'Untitled schedule';
  const days = [...document.querySelectorAll('.day-chip.active')].map(c => Number(c.dataset.day));
  const startTime = document.getElementById('sched-start').value || '09:00';
  const endTime = document.getElementById('sched-end').value || '17:00';
  const blackout = document.getElementById('sched-blackout').checked;

  const action = document.querySelector('input[name="sched-action"]:checked').value;
  const redirectUrl = document.getElementById('sched-redirect-url').value.trim();

  if (action === 'redirect' && redirectUrl && !redirectUrl.startsWith('https://') && !redirectUrl.startsWith('http://')) {
    alert('Redirect URL must start with https:// or http://');
    return;
  }

  const schedule = {
    id: editingScheduleId || undefined,
    name,
    days,
    startTime,
    endTime,
    blackout,
    action,
    redirectUrl: action === 'redirect' ? redirectUrl : '',
    adHocSites: modalSites,
    listIds: modalListIds,
    enabled: true
  };

  if (editingScheduleId) {
    const existing = (await getSchedules()).find(s => s.id === editingScheduleId);
    if (existing) schedule.enabled = existing.enabled;
  }

  await saveSchedule(schedule);
  chrome.runtime.sendMessage({ type: 'refreshRules' });
  closeScheduleModal();
  renderSchedules();
}

// Day chip toggles
document.querySelectorAll('.day-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    chip.classList.toggle('active');
    updateSummary();
  });
});

// Action radio toggle
document.querySelectorAll('input[name="sched-action"]').forEach(r => {
  r.addEventListener('change', () => {
    document.getElementById('redirect-url-section').style.display = r.value === 'redirect' && r.checked ? 'block' : 'none';
    updateSummary();
  });
});

// Quick day selectors
document.getElementById('days-weekdays').addEventListener('click', () => {
  document.querySelectorAll('.day-chip').forEach(c => {
    c.classList.toggle('active', [1,2,3,4,5].includes(Number(c.dataset.day)));
  });
  updateSummary();
});

document.getElementById('days-everyday').addEventListener('click', () => {
  document.querySelectorAll('.day-chip').forEach(c => c.classList.add('active'));
  updateSummary();
});

document.getElementById('days-weekends').addEventListener('click', () => {
  document.querySelectorAll('.day-chip').forEach(c => {
    c.classList.toggle('active', [0,6].includes(Number(c.dataset.day)));
  });
  updateSummary();
});

// Time inputs
document.getElementById('sched-start').addEventListener('input', () => { updateOvernightHint(); updateSummary(); });
document.getElementById('sched-end').addEventListener('input', () => { updateOvernightHint(); updateSummary(); });

// Blackout toggle
document.getElementById('sched-blackout').addEventListener('change', () => { toggleBlackoutUI(); updateSummary(); });

// Add site to schedule
document.getElementById('sched-add-site').addEventListener('click', () => {
  const input = document.getElementById('sched-site-input');
  const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (val && !modalSites.includes(val)) {
    modalSites.push(val);
    renderModalSites();
    updateSummary();
  }
  input.value = '';
  input.focus();
});

document.getElementById('sched-site-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('sched-add-site').click();
});

// Schedule name
document.getElementById('sched-name').addEventListener('input', updateSummary);

// Modal buttons
document.getElementById('add-schedule').addEventListener('click', () => openScheduleModal(null));
document.getElementById('add-schedule-empty').addEventListener('click', () => openScheduleModal(null));
document.getElementById('modal-close').addEventListener('click', closeScheduleModal);
document.getElementById('modal-cancel').addEventListener('click', closeScheduleModal);
document.getElementById('modal-save').addEventListener('click', saveCurrentSchedule);
document.getElementById('schedule-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeScheduleModal();
});

// ─── Allowlist ───

async function renderAllowlist() {
  const allowlist = await getAllowlist();
  const container = document.getElementById('allowlist-items');
  container.innerHTML = allowlist.map((site, i) => `
    <span class="chip">${esc(site)}<button class="chip-remove" onclick="removeAllowlistItem(${i})">&times;</button></span>
  `).join('');
}

window.removeAllowlistItem = async function(i) {
  const allowlist = await getAllowlist();
  allowlist.splice(i, 1);
  await saveAllowlist(allowlist);
  chrome.runtime.sendMessage({ type: 'refreshRules' });
  renderAllowlist();
};

document.getElementById('add-allowlist').addEventListener('click', async () => {
  const input = document.getElementById('allowlist-input');
  const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!val) return;
  const allowlist = await getAllowlist();
  if (!allowlist.includes(val)) {
    allowlist.push(val);
    await saveAllowlist(allowlist);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    renderAllowlist();
  }
  input.value = '';
  input.focus();
});

document.getElementById('allowlist-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('add-allowlist').click();
});

// ─── Lists ───

async function renderLists() {
  const lists = await getLists();
  const schedules = await getSchedules();
  const container = document.getElementById('lists-container');
  const empty = document.getElementById('lists-empty');

  if (lists.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  container.style.display = 'flex';
  empty.style.display = 'none';

  container.innerHTML = lists.map(l => {
    const usedIn = schedules.filter(s => (s.listIds || []).includes(l.id));
    const usedStr = usedIn.length > 0 ? `Used in ${usedIn.map(s => s.name).join(', ')}` : 'Not used in any schedule';

    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${esc(l.name)}</span>
          <div class="card-actions">
            <button class="icon-btn" onclick="editList('${l.id}')" title="Edit">${icon('pencil')}</button>
            <button class="icon-btn" onclick="removeList('${l.id}')" title="Delete">${icon('trash')}</button>
          </div>
        </div>
        <div class="card-subtitle">${l.sites.length} sites · ${usedStr}</div>
      </div>
    `;
  }).join('');
}

window.editList = async function(id) {
  const lists = await getLists();
  const list = lists.find(l => l.id === id);
  if (!list) return;
  openListModal(list);
};

window.removeList = async function(id) {
  if (!confirm('Delete this list? It will be detached from all schedules.')) return;
  await deleteList(id);
  renderLists();
  renderSchedules();
};

function openListModal(list) {
  editingListId = list ? list.id : null;
  document.getElementById('list-modal-title').textContent = list ? 'Edit list' : 'New list';
  document.getElementById('list-name').value = list ? list.name : '';
  listModalSites = list ? [...list.sites] : [];
  renderListModalSites();
  document.getElementById('list-modal').style.display = 'flex';
}

function closeListModal() {
  document.getElementById('list-modal').style.display = 'none';
  editingListId = null;
  listModalSites = [];
}

function renderListModalSites() {
  const container = document.getElementById('list-site-chips');
  container.innerHTML = listModalSites.map((site, i) => `
    <span class="chip">${esc(site)}<button class="chip-remove" onclick="removeListModalSite(${i})">&times;</button></span>
  `).join('');
}

window.removeListModalSite = function(i) {
  listModalSites.splice(i, 1);
  renderListModalSites();
};

async function saveCurrentList() {
  const name = document.getElementById('list-name').value.trim() || 'Untitled list';
  const list = {
    id: editingListId || undefined,
    name,
    sites: listModalSites,
    origin: 'user'
  };
  await saveList(list);
  chrome.runtime.sendMessage({ type: 'refreshRules' });
  closeListModal();
  renderLists();
}

document.getElementById('list-add-site').addEventListener('click', () => {
  const input = document.getElementById('list-site-input');
  const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (val && !listModalSites.includes(val)) {
    listModalSites.push(val);
    renderListModalSites();
  }
  input.value = '';
  input.focus();
});

document.getElementById('list-site-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('list-add-site').click();
});

document.getElementById('add-list').addEventListener('click', () => openListModal(null));
document.getElementById('add-list-empty').addEventListener('click', () => openListModal(null));
document.getElementById('list-modal-close').addEventListener('click', closeListModal);
document.getElementById('list-modal-cancel').addEventListener('click', closeListModal);
document.getElementById('list-modal-save').addEventListener('click', saveCurrentList);
document.getElementById('list-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeListModal();
});

// ─── Utility ───

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Usage Dashboard ───

async function renderUsage() {
  const usage = await getUsage();
  const statsContainer = document.getElementById('usage-stats');
  const nudgesContainer = document.getElementById('coaching-nudges');
  const coachingEmpty = document.getElementById('coaching-empty');

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Aggregate stats
  let todayBlocks = 0, weekBlocks = 0, todaySnoozes = 0, weekEscapes = 0;
  const siteCounts = {};

  for (const [key, count] of Object.entries(usage.blockCounts || {})) {
    const [domain, date] = key.split('|');
    if (date === today) todayBlocks += count;
    if (date >= weekAgo) {
      weekBlocks += count;
      siteCounts[domain] = (siteCounts[domain] || 0) + count;
    }
  }
  for (const [key, count] of Object.entries(usage.snoozeCounts || {})) {
    const [, date] = key.split('|');
    if (date === today) todaySnoozes += count;
  }
  for (const [key, count] of Object.entries(usage.escapeCounts || {})) {
    const [, date] = key.split('|');
    if (date >= weekAgo) weekEscapes += count;
  }

  statsContainer.innerHTML = `
    <div class="usage-stat">
      <div class="usage-number">${todayBlocks}</div>
      <div class="usage-label">Blocks today</div>
    </div>
    <div class="usage-stat">
      <div class="usage-number">${weekBlocks}</div>
      <div class="usage-label">Blocks this week</div>
    </div>
    <div class="usage-stat">
      <div class="usage-number">${todaySnoozes}</div>
      <div class="usage-label">Snoozes today</div>
    </div>
    <div class="usage-stat">
      <div class="usage-number">${weekEscapes}</div>
      <div class="usage-label">Overrides this week</div>
    </div>
  `;

  // Coaching nudges — rule-based, local, never shaming
  const nudges = [];
  const topSites = Object.entries(siteCounts).sort((a, b) => b[1] - a[1]);

  if (topSites.length > 0 && topSites[0][1] >= 10) {
    nudges.push({
      iconName: 'refresh-cw',
      text: `${topSites[0][0]} pulled you back ${topSites[0][1]} times this week. That's your focus working — each block is a moment you chose your priorities.`
    });
  }

  if (weekBlocks > 0 && weekEscapes === 0) {
    nudges.push({
      iconName: 'zap',
      text: `${weekBlocks} blocks this week and zero overrides. You're building a strong focus habit.`
    });
  }

  if (todayBlocks > 5 && todaySnoozes === 0) {
    nudges.push({
      iconName: 'target',
      text: `${todayBlocks} blocks deflected today without a single snooze. That's discipline.`
    });
  }

  if (weekBlocks >= 20) {
    nudges.push({
      iconName: 'trending-up',
      text: `${weekBlocks} blocks this week. Your focused time is adding up — keep going.`
    });
  }

  if (topSites.length >= 3) {
    const names = topSites.slice(0, 3).map(([d]) => d).join(', ');
    nudges.push({
      iconName: 'bar-chart',
      text: `Your top distractions this week: ${names}. Knowing is half the battle.`
    });
  }

  if (nudges.length === 0) {
    nudgesContainer.style.display = 'none';
    coachingEmpty.style.display = 'block';
  } else {
    nudgesContainer.style.display = 'flex';
    coachingEmpty.style.display = 'none';
    nudgesContainer.innerHTML = nudges.map((n, i) => `
      <div class="coaching-card" id="nudge-${i}">
        <span class="coaching-icon">${icon(n.iconName, 20)}</span>
        <span class="coaching-text">${esc(n.text)}</span>
        <button class="coaching-dismiss" onclick="this.parentElement.remove()" title="Dismiss">&times;</button>
      </div>
    `).join('');
  }
}

// ─── Settings ───

async function renderSettings() {
  const settings = await getSettings();

  // Passphrase
  const currentDisplay = document.getElementById('current-phrase-display');
  const currentSection = document.getElementById('passphrase-current');
  const verifySection = document.getElementById('passphrase-verify');
  const newLabel = document.getElementById('new-phrase-label');

  if (settings.passphrase) {
    currentSection.style.display = 'block';
    currentDisplay.textContent = settings.passphrase;
    verifySection.style.display = 'block';
    newLabel.textContent = 'New phrase';
  } else {
    currentSection.style.display = 'none';
    verifySection.style.display = 'none';
    newLabel.textContent = 'Set your phrase';
  }

  // Friction level
  document.getElementById('friction-level').value = settings.frictionLevel || 'passphrase';

  // Cooldown
  document.getElementById('cooldown-seconds').value = settings.cooldownSeconds || 30;

  // Sync
  document.getElementById('sync-toggle').checked = settings.syncEnabled || false;
}

document.getElementById('save-phrase-btn').addEventListener('click', async () => {
  const settings = await getSettings();
  const newPhrase = document.getElementById('settings-new-phrase').value.trim();
  if (!newPhrase) return;

  // Recursive: if there's an existing passphrase, verify it first
  if (settings.passphrase) {
    const verify = document.getElementById('settings-verify-phrase').value;
    if (verify !== settings.passphrase) {
      alert('Current phrase doesn\'t match. Type your existing phrase to change it.');
      return;
    }
  }

  await saveSettings({ passphrase: newPhrase });
  document.getElementById('settings-new-phrase').value = '';
  document.getElementById('settings-verify-phrase').value = '';
  renderSettings();
});

document.getElementById('friction-level').addEventListener('change', async () => {
  await saveSettings({ frictionLevel: document.getElementById('friction-level').value });
});

document.getElementById('cooldown-seconds').addEventListener('change', async () => {
  await saveSettings({ cooldownSeconds: parseInt(document.getElementById('cooldown-seconds').value) || 30 });
});

document.getElementById('sync-toggle').addEventListener('change', async () => {
  const enabled = document.getElementById('sync-toggle').checked;

  if (!enabled) {
    await saveSettings({ syncEnabled: false });
    return;
  }

  // If another profile already synced a config, offer to adopt it
  // instead of silently overwriting it with this profile's config.
  let remote = null;
  try {
    remote = (await chrome.storage.sync.get('focusBlockSync')).focusBlockSync;
  } catch { /* sync unavailable */ }

  if (remote && (remote.schedules || []).length > 0) {
    const useRemote = confirm(
      'Found synced settings from another Chrome profile.\n\n' +
      'OK — use the synced settings here (replaces this profile\'s schedules, lists, and allowed sites)\n' +
      'Cancel — keep this profile\'s settings and overwrite the synced copy'
    );
    if (useRemote) {
      await applySyncedConfig(remote, true);
    }
  }

  // saveSettings -> setData pushes the (possibly adopted) config to sync
  await saveSettings({ syncEnabled: true });
  chrome.runtime.sendMessage({ type: 'refreshRules' });
  await renderSchedules();
  await renderAllowlist();
  await renderLists();
  await renderSettings();
});

// Export
document.getElementById('export-btn').addEventListener('click', async () => {
  const json = await exportData();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `focus-block-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Import
document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    await importData(text);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    alert('Settings imported successfully.');
    renderSchedules();
    renderAllowlist();
    renderLists();
    renderSettings();
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
  e.target.value = '';
});

// ─── Init ───

async function init() {
  await renderSchedules();
  await renderAllowlist();
  await renderLists();
  await renderUsage();
  await renderSettings();
}

init();
