const PRESETS = {
  social: null,
  news: null,
  streaming: null
};

async function loadPresets() {
  for (const key of Object.keys(PRESETS)) {
    try {
      const url = chrome.runtime.getURL(`presets/${key}.json`);
      const resp = await fetch(url);
      PRESETS[key] = await resp.json();
    } catch { /* preset not found */ }
  }
}

const TEMPLATES = {
  work: {
    schedule: {
      name: 'Work focus',
      days: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00',
      blackout: false,
      adHocSites: [],
      listIds: [],
      enabled: true
    },
    presetKeys: ['social'],
    confirmText: 'Social media is now blocked on weekdays, 9am–5pm.'
  },
  bedtime: {
    schedule: {
      name: 'Bedtime',
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: '22:00',
      endTime: '07:00',
      blackout: false,
      adHocSites: [],
      listIds: [],
      enabled: true
    },
    presetKeys: ['social', 'streaming'],
    confirmText: 'Social media and streaming are now blocked every night, 10pm–7am.'
  },
  deepwork: {
    schedule: {
      name: 'Deep work',
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
      blackout: true,
      adHocSites: [],
      listIds: [],
      enabled: false
    },
    presetKeys: [],
    confirmText: 'Deep work schedule created. Toggle it on when you need total focus — only your allowed sites will be reachable.'
  }
};

async function applyTemplate(templateKey) {
  if (templateKey === 'custom') {
    await markOnboardingComplete();
    chrome.runtime.openOptionsPage();
    return;
  }

  const template = TEMPLATES[templateKey];
  if (!template) return;

  // Create preset lists and attach them to the schedule
  const listIds = [];
  for (const presetKey of template.presetKeys) {
    const preset = PRESETS[presetKey];
    if (preset) {
      const list = await saveList({
        name: preset.name,
        sites: [...preset.sites],
        origin: 'frozen'
      });
      listIds.push(list.id);
    }
  }

  const schedule = { ...template.schedule, listIds };
  await saveSchedule(schedule);
  chrome.runtime.sendMessage({ type: 'refreshRules' });
  await markOnboardingComplete();

  // Show confirmation, then passphrase nudge
  document.querySelector('.templates').style.display = 'none';
  document.querySelector('.alt-actions').style.display = 'none';
  document.getElementById('passphrase-nudge').style.display = 'block';
  document.getElementById('confirm-text').textContent = template.confirmText;
}

async function markOnboardingComplete() {
  await saveSettings({ onboardingComplete: true });
}

// Passphrase nudge
document.getElementById('save-passphrase').addEventListener('click', async () => {
  const phrase = document.getElementById('passphrase-input').value.trim();
  if (phrase) {
    await saveSettings({ passphrase: phrase, frictionLevel: 'passphrase' });
  }
  showConfirmation();
});

document.getElementById('skip-passphrase').addEventListener('click', () => {
  showConfirmation();
});

function showConfirmation() {
  document.getElementById('passphrase-nudge').style.display = 'none';
  document.getElementById('confirmation').style.display = 'block';
}

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Skip
document.getElementById('skip-btn').addEventListener('click', async () => {
  await markOnboardingComplete();
  chrome.runtime.openOptionsPage();
});

// Template cards
document.querySelectorAll('.template-card').forEach(card => {
  card.addEventListener('click', () => {
    applyTemplate(card.dataset.template);
  });
});

loadPresets();
