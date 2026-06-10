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
      if (listCount > 0) parts.push(listNames.join(', '));
      sitesDesc = parts.join(' + ') || 'No sites';
    }

    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${esc(s.name)}</span>
          <div class="card-actions">
            <button class="icon-btn" onclick="editSchedule('${s.id}')" title="Edit">✏️</button>
            <button class="icon-btn" onclick="removeSchedule('${s.id}')" title="Delete">🗑️</button>
            <label class="toggle">
              <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="toggleSchedule('${s.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="card-subtitle">${days} · ${s.startTime}–${s.endTime} · ${sitesDesc}</div>
      </div>
    `;
  }).join('');
}

window.toggleSchedule = async function(id, enabled) {
  const schedules = await getSchedules();
  const schedule = schedules.find(s => s.id === id);
  if (schedule) {
    schedule.enabled = enabled;
    await saveSchedule(schedule);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
  }
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

  const schedule = {
    id: editingScheduleId || undefined,
    name,
    days,
    startTime,
    endTime,
    blackout,
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
            <button class="icon-btn" onclick="editList('${l.id}')" title="Edit">✏️</button>
            <button class="icon-btn" onclick="removeList('${l.id}')" title="Delete">🗑️</button>
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

// ─── Init ───

async function init() {
  await renderSchedules();
  await renderAllowlist();
  await renderLists();
}

init();
