(() => {
  'use strict';

  const SEARCH_ENGINES = {
    google: {
      label: 'Google',
      icon: 'G',
      buildUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`
    },
    yandex: {
      label: 'Яндекс',
      icon: 'Я',
      buildUrl: (q) => `https://ya.ru/search/?text=${encodeURIComponent(q)}`
    },
    bing: {
      label: 'Bing',
      icon: 'B',
      buildUrl: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
    },
    duckduckgo: {
      label: 'DuckDuckGo',
      icon: 'D',
      buildUrl: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
    }
  };

  const FONT_STACKS = { ui: 'var(--font-ui)', mono: 'var(--font-mono)', round: 'var(--font-round)' };

  let settings = null;
  let tabs = [];        // { id, webview, title, url, loading }
  let activeTabId = null;
  let tabSeq = 0;

  const el = (id) => document.getElementById(id);
  const tabstrip = el('tabstrip');
  const webviewContainer = el('webview-container');
  const addressInput = el('address-input');
  const engineToggleBtn = el('engine-toggle');
  const engineIcon = el('engine-icon');
  const loadIndicator = el('load-indicator');

  // ---------- URL helpers ----------
  function looksLikeUrl(input) {
    const s = input.trim();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return true;         // has scheme
    if (/^localhost(:\d+)?(\/.*)?$/i.test(s)) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(s)) return true; // IPv4
    // domain.tld with no spaces
    if (/^[^\s]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(s) && !s.includes(' ')) return true;
    return false;
  }

  function normalizeUrl(input) {
    if (!input || input.trim() === '') return newtabUrl();
    const s = input.trim();
    if (s === 'brows://newtab') return newtabUrl();
    if (looksLikeUrl(s)) {
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return 'https://' + s;
      return s;
    }
    // It's a search query
    const engine = SEARCH_ENGINES[settings.searchEngine];
    if (engine && engine.buildUrl) {
      return engine.buildUrl(s);
    }
    // Fallback to Google if engine not found
    return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
  }

  function newtabUrl() {
    return buildNewtabUrl();
  }

  function buildNewtabUrl() {
    const nt = settings.newtab;
    const params = new URLSearchParams({
      accent: settings.theme.accent,
      bgType: nt.bgType,
      bgValue: nt.bgValue,
      engine: settings.searchEngine,
      shortcuts: JSON.stringify(nt.shortcuts)
    });
    return `newtab.html?${params.toString()}`;
  }

  function resolveHomepage() {
    return normalizeUrl(settings.homepage || 'brows://newtab');
  }

  // ---------- Theme ----------
  function applyTheme() {
    const t = settings.theme;
    const root = document.documentElement.style;
    root.setProperty('--accent', t.accent);
    root.setProperty('--chrome-bg', t.chromeBg);
    root.setProperty('--chrome-bg-2', t.chromeBg2);
    root.setProperty('--tab-active', t.tabActive);
    root.setProperty('--radius', t.radius + 'px');
    root.setProperty('--font-current', FONT_STACKS[t.font] || FONT_STACKS.ui);

    if (t.density === 'compact') {
      root.setProperty('--toolbar-h', '38px');
      root.setProperty('--tab-h', '28px');
    } else {
      root.setProperty('--toolbar-h', '46px');
      root.setProperty('--tab-h', '34px');
    }

    engineIcon.textContent = SEARCH_ENGINES[settings.searchEngine].icon;
  }

  function persistSettings() {
    window.browsAPI.setSettings(settings);
  }

  // ---------- Tabs ----------
  function createTab(rawUrl, activate = true) {
    const id = 'tab-' + (++tabSeq);
    const url = normalizeUrl(rawUrl || 'brows://newtab');

    const webview = document.createElement('webview');
    webview.setAttribute('src', url);
    webview.setAttribute('allowpopups', '');
    webviewContainer.appendChild(webview);

    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.id = id;
    tabEl.innerHTML = `
      <span class="tab-favicon"></span>
      <span class="tab-title">Новая вкладка</span>
      <button class="tab-close" title="Закрыть">&#10005;</button>
    `;
    tabstrip.appendChild(tabEl);

    const tab = { id, webview, tabEl, title: 'Новая вкладка', url, loading: true, canBack: false, canForward: false };
    tabs.push(tab);

    tabEl.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return;
      switchTab(id);
    });
    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(id);
    });

    webview.addEventListener('page-title-updated', (e) => {
      tab.title = e.title || tab.title;
      tabEl.querySelector('.tab-title').textContent = tab.title;
    });
    webview.addEventListener('page-favicon-updated', (e) => {
      if (e.favicons && e.favicons[0]) {
        tabEl.querySelector('.tab-favicon').style.background = `center/contain no-repeat url(${e.favicons[0]})`;
      }
    });
    webview.addEventListener('did-start-loading', () => {
      tab.loading = true;
      if (tab.id === activeTabId) updateLoadIndicator();
    });
    webview.addEventListener('did-stop-loading', () => {
      tab.loading = false;
      tab.canBack = webview.canGoBack();
      tab.canForward = webview.canGoForward();
      if (tab.id === activeTabId) { updateLoadIndicator(); updateNavButtons(); }
    });
    webview.addEventListener('did-navigate', (e) => onNavigate(tab, e.url));
    webview.addEventListener('did-navigate-in-page', (e) => onNavigate(tab, e.url));
    webview.addEventListener('new-window', (e) => {
      // открываем во внутренней новой вкладке вместо системного окна
      createTab(e.url, true);
    });

    if (activate) switchTab(id);
    return tab;
  }

  function onNavigate(tab, url) {
    tab.url = url;
    if (tab.id === activeTabId) {
      addressInput.value = url.includes('newtab.html') ? '' : url;
    }
  }

  function switchTab(id) {
    activeTabId = id;
    tabs.forEach((t) => {
      const isActive = t.id === id;
      t.webview.classList.toggle('active', isActive);
      t.tabEl.classList.toggle('active', isActive);
    });
    const tab = getActiveTab();
    if (tab) {
      addressInput.value = tab.url.includes('newtab.html') ? '' : tab.url;
      updateLoadIndicator();
      updateNavButtons();
    }
  }

  function closeTab(id) {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const [tab] = tabs.splice(idx, 1);
    tab.webview.remove();
    tab.tabEl.remove();

    if (tabs.length === 0) {
      createTab('brows://newtab');
      return;
    }
    if (activeTabId === id) {
      const next = tabs[idx] || tabs[idx - 1] || tabs[0];
      switchTab(next.id);
    }
  }

  function getActiveTab() {
    return tabs.find((t) => t.id === activeTabId);
  }

  function updateLoadIndicator() {
    const tab = getActiveTab();
    loadIndicator.classList.toggle('hidden', !tab || !tab.loading);
    loadIndicator.classList.toggle('spin', !!(tab && tab.loading));
  }

  function updateNavButtons() {
    const tab = getActiveTab();
    el('btn-back').disabled = !tab || !tab.canBack;
    el('btn-forward').disabled = !tab || !tab.canForward;
  }

  // ---------- Navigation controls ----------
  el('btn-back').addEventListener('click', () => getActiveTab()?.webview.goBack());
  el('btn-forward').addEventListener('click', () => getActiveTab()?.webview.goForward());
  el('btn-reload').addEventListener('click', () => getActiveTab()?.webview.reload());
  el('btn-home').addEventListener('click', () => navigateActive(resolveHomepage()));
  el('tab-add').addEventListener('click', () => createTab('brows://newtab'));

  function navigateActive(url) {
    const tab = getActiveTab();
    if (!tab) return;
    tab.webview.src = url;
  }

  addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const target = normalizeUrl(addressInput.value);
      navigateActive(target);
      addressInput.blur();
    }
  });

  engineToggleBtn.addEventListener('click', () => {
    settings.searchEngine = settings.searchEngine === 'google' ? 'yandex' : 'google';
    applyTheme();
    syncSettingsUI();
    persistSettings();
    pushNewtabSettingsToAllTabs();
  });

  // ---------- Window controls ----------
  el('win-min').addEventListener('click', () => window.browsAPI.minimize());
  el('win-max').addEventListener('click', () => window.browsAPI.maximize());
  el('win-close').addEventListener('click', () => window.browsAPI.close());

  // ---------- Keyboard shortcuts ----------
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 't') { e.preventDefault(); createTab('brows://newtab'); }
    if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
    if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); addressInput.focus(); addressInput.select(); }
  });

  // ---------- Settings panel ----------
  const panel = el('settings-panel');
  el('btn-settings').addEventListener('click', () => panel.classList.toggle('hidden'));
  el('settings-close').addEventListener('click', () => panel.classList.add('hidden'));

  function wireSeg(containerId, key, path) {
    const container = el(containerId);
    container.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        setDeep(path, btn.dataset[key]);
        applyTheme();
        persistSettings();
      });
    });
  }

  function setDeep(path, value) {
    // path e.g. "theme.radius" or "searchEngine"
    const parts = path.split('.');
    let obj = settings;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
  }

  function getDeep(path) {
    const parts = path.split('.');
    let obj = settings;
    for (const p of parts) obj = obj[p];
    return obj;
  }

  wireSeg('engine-picker', 'engine', 'searchEngine');
  el('engine-picker').addEventListener('click', (e) => {
    if (e.target.closest('.seg-btn')) { applyTheme(); pushNewtabSettingsToAllTabs(); }
  });
  wireSeg('density-picker', 'density', 'theme.density');
  wireSeg('font-picker', 'font', 'theme.font');
  wireSeg('newtab-bgtype-picker', 'bgtype', 'newtab.bgType');
  el('newtab-bgtype-picker').addEventListener('click', (e) => {
    if (e.target.closest('.seg-btn')) pushNewtabSettingsToAllTabs();
  });

  el('homepage-input').addEventListener('change', (e) => {
    settings.homepage = e.target.value.trim() || 'brows://newtab';
    persistSettings();
  });

  el('accent-swatches').addEventListener('click', (e) => {
    const btn = e.target.closest('.swatch');
    if (!btn) return;
    settings.theme.accent = btn.dataset.color;
    el('accent-custom').value = btn.dataset.color;
    document.querySelectorAll('#accent-swatches .swatch').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    applyTheme(); persistSettings(); pushNewtabSettingsToAllTabs();
  });
  el('accent-custom').addEventListener('input', (e) => {
    settings.theme.accent = e.target.value;
    applyTheme(); persistSettings(); pushNewtabSettingsToAllTabs();
  });

  el('chromebg-input').addEventListener('input', (e) => {
    settings.theme.chromeBg = e.target.value;
    settings.theme.chromeBg2 = shade(e.target.value, 8);
    applyTheme(); persistSettings();
  });
  el('tabactive-input').addEventListener('input', (e) => {
    settings.theme.tabActive = e.target.value;
    applyTheme(); persistSettings();
  });

  el('radius-input').addEventListener('input', (e) => {
    settings.theme.radius = Number(e.target.value);
    el('radius-val').textContent = e.target.value;
    applyTheme(); persistSettings();
  });

  el('newtab-bgvalue-input').addEventListener('change', (e) => {
    settings.newtab.bgValue = e.target.value.trim();
    persistSettings();
    pushNewtabSettingsToAllTabs();
  });

  el('settings-reset').addEventListener('click', async () => {
    settings = await window.browsAPI.resetSettings();
    applyTheme();
    syncSettingsUI();
    pushNewtabSettingsToAllTabs();
  });

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = Math.min(255, Math.max(0, (n >> 16) + amt));
    let g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
    let b = Math.min(255, Math.max(0, (n & 0xff) + amt));
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function syncSettingsUI() {
    document.querySelectorAll('#engine-picker .seg-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.engine === settings.searchEngine));
    document.querySelectorAll('#density-picker .seg-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.density === settings.theme.density));
    document.querySelectorAll('#font-picker .seg-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.font === settings.theme.font));
    document.querySelectorAll('#newtab-bgtype-picker .seg-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.bgtype === settings.newtab.bgType));
    document.querySelectorAll('#accent-swatches .swatch').forEach((b) =>
      b.classList.toggle('active', b.dataset.color === settings.theme.accent));

    el('homepage-input').value = settings.homepage;
    el('accent-custom').value = settings.theme.accent;
    el('chromebg-input').value = settings.theme.chromeBg;
    el('tabactive-input').value = settings.theme.tabActive;
    el('radius-input').value = settings.theme.radius;
    el('radius-val').textContent = settings.theme.radius;
    el('newtab-bgvalue-input').value = settings.newtab.bgValue;
  }

  function pushNewtabSettingsToAllTabs() {
    // страница новой вкладки читает настройки из query-параметров URL,
    // поэтому просто пересобираем адрес и мягко обновляем открытые вкладки
    const url = buildNewtabUrl();
    tabs.forEach((t) => {
      if (t.webview.getURL && t.webview.getURL().includes('newtab.html')) {
        t.webview.src = url;
      }
    });
  }

  // ---------- Init ----------
  async function init() {
    settings = await window.browsAPI.getSettings();
    applyTheme();
    syncSettingsUI();
    createTab(resolveHomepage());
  }

  init();
})();

// ---------- Settings navigation ----------
const settingsNavBtns = document.querySelectorAll('.settings-nav-btn');
const settingsSections = document.querySelectorAll('.settings-section');

settingsNavBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const sectionId = btn.dataset.section;
    
    // Update nav buttons
    settingsNavBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Show corresponding section
    settingsSections.forEach(sec => {
      sec.classList.toggle('active', sec.id === `section-${sectionId}`);
    });
  });
});

// ---------- Extensions management ----------
async function loadExtensions() {
  const exts = await window.browsAPI.getExtensions();
  const container = document.getElementById('extensions-list');
  container.innerHTML = '';
  
  exts.forEach(ext => {
    const div = document.createElement('div');
    div.className = 'extension-item';
    div.innerHTML = `
      <div class="extension-info">
        <div class="extension-icon">${ext.hasIcon ? '📦' : '🔌'}</div>
        <div class="extension-details">
          <div class="extension-name">${escapeHtml(ext.name)}</div>
          <div class="extension-desc">${escapeHtml(ext.description || '')}</div>
          <div class="extension-meta">v${ext.version} • ${escapeHtml(ext.author || 'Unknown')}</div>
        </div>
      </div>
      <label class="toggle-label">
        <input type="checkbox" class="extension-toggle" data-id="${ext.id}" ${ext.enabled ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
    `;
    container.appendChild(div);
  });
  
  container.querySelectorAll('.extension-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const extId = e.target.dataset.id;
      const enabled = e.target.checked;
      await window.browsAPI.setExtensionEnabled(extId, enabled);
    });
  });
}

// ---------- Hotkeys management ----------
let currentHotkeyCombo = [];
let isRecordingHotkey = false;

const hotkeyComboInput = document.getElementById('hotkey-combo-input');
const hotkeyActionSelect = document.getElementById('hotkey-action-select');
const addHotkeyBtn = document.getElementById('add-hotkey-btn');
const conditionEditor = document.getElementById('condition-editor');
const addConditionBtn = document.getElementById('add-condition-btn');

// Record key combination
hotkeyComboInput.addEventListener('keydown', (e) => {
  e.preventDefault();
  const keys = [];
  if (e.ctrlKey) keys.push('Ctrl');
  if (e.altKey) keys.push('Alt');
  if (e.shiftKey) keys.push('Shift');
  if (e.metaKey) keys.push('Meta');
  
  const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(keyName)) {
    keys.push(keyName);
  }
  
  currentHotkeyCombo = keys;
  hotkeyComboInput.value = keys.join(' + ');
});

hotkeyComboInput.addEventListener('keyup', () => {
  if (currentHotkeyCombo.length > 0) {
    isRecordingHotkey = true;
  }
});

hotkeyComboInput.addEventListener('blur', () => {
  setTimeout(() => { isRecordingHotkey = false; }, 200);
});

// Add condition node
addConditionBtn.addEventListener('click', () => {
  const node = document.createElement('div');
  node.className = 'condition-node';
  node.innerHTML = `
    <select class="condition-type">
      <option value="url_contains">URL содержит</option>
      <option value="url_equals">URL равен</option>
      <option value="url_starts">URL начинается с</option>
      <option value="domain_equals">Домен равен</option>
    </select>
    <input type="text" class="condition-value" placeholder="например: youtube.com" />
    <button class="remove-condition-btn">&times;</button>
  `;
  node.querySelector('.remove-condition-btn').addEventListener('click', () => node.remove());
  conditionEditor.appendChild(node);
});

// Add hotkey
addHotkeyBtn.addEventListener('click', async () => {
  const combo = currentHotkeyCombo.join('+');
  const action = hotkeyActionSelect.value;
  
  if (!combo || !action) {
    alert('Выберите комбинацию клавиш и действие');
    return;
  }
  
  // Build conditions
  const conditions = [];
  conditionEditor.querySelectorAll('.condition-node').forEach(node => {
    const type = node.querySelector('.condition-type').value;
    const value = node.querySelector('.condition-value').value.trim();
    if (value) {
      conditions.push({ type, value });
    }
  });
  
  const hotkeys = await window.browsAPI.getHotkeys();
  hotkeys.push({
    id: Date.now().toString(),
    accelerator: combo,
    action,
    conditions,
    enabled: true
  });
  
  await window.browsAPI.setHotkeys(hotkeys);
  await window.browsAPI.refreshHotkeys();
  
  // Reset form
  currentHotkeyCombo = [];
  hotkeyComboInput.value = '';
  hotkeyActionSelect.value = '';
  conditionEditor.innerHTML = '<div class="condition-node"><select class="condition-type"><option value="url_contains">URL содержит</option><option value="url_equals">URL равен</option><option value="url_starts">URL начинается с</option><option value="domain_equals">Домен равен</option></select><input type="text" class="condition-value" placeholder="например: youtube.com" /></div>';
  addConditionBtn.previousElementSibling?.remove();
  
  await loadHotkeys();
});

async function loadHotkeys() {
  const hotkeys = await window.browsAPI.getHotkeys();
  const container = document.getElementById('hotkeys-list');
  container.innerHTML = '';
  
  if (hotkeys.length === 0) {
    container.innerHTML = '<p class="empty-message">Нет созданных горячих клавиш</p>';
    return;
  }
  
  hotkeys.forEach(hk => {
    const div = document.createElement('div');
    div.className = 'hotkey-item';
    div.innerHTML = `
      <div class="hotkey-combo">${escapeHtml(hk.accelerator)}</div>
      <div class="hotkey-action">${getActionLabel(hk.action)}</div>
      ${hk.conditions?.length ? `<div class="hotkey-conditions">${hk.conditions.map(c => `${getConditionLabel(c.type)} "${escapeHtml(c.value)}"`).join(', ')}</div>` : ''}
      <button class="remove-hotkey-btn" data-id="${hk.id}">&times;</button>
    `;
    container.appendChild(div);
  });
  
  container.querySelectorAll('.remove-hotkey-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      let hotkeys = await window.browsAPI.getHotkeys();
      hotkeys = hotkeys.filter(h => h.id !== id);
      await window.browsAPI.setHotkeys(hotkeys);
      await window.browsAPI.refreshHotkeys();
      await loadHotkeys();
    });
  });
}

function getActionLabel(action) {
  const labels = {
    newTab: 'Новая вкладка',
    closeTab: 'Закрыть вкладку',
    reload: 'Обновить',
    focusAddress: 'Фокус на адресную строку',
    back: 'Назад',
    forward: 'Вперёд',
    home: 'Домой',
    toggleBookmarks: 'Закладки',
    toggleHistory: 'История',
    openNotes: 'Открыть заметки'
  };
  return labels[action] || action;
}

function getConditionLabel(type) {
  const labels = {
    url_contains: 'URL содержит',
    url_equals: 'URL равен',
    url_starts: 'URL начинается с',
    domain_equals: 'Домен равен'
  };
  return labels[type] || type;
}

// Handle triggered hotkeys
window.browsAPI.onHotkeyTriggered((event, hk) => {
  const tab = getActiveTab();
  const currentUrl = tab?.url || '';
  
  // Check conditions
  if (hk.conditions?.length) {
    let allMatch = true;
    for (const cond of hk.conditions) {
      let match = false;
      switch (cond.type) {
        case 'url_contains': match = currentUrl.includes(cond.value); break;
        case 'url_equals': match = currentUrl === cond.value; break;
        case 'url_starts': match = currentUrl.startsWith(cond.value); break;
        case 'domain_equals': 
          try { match = new URL(currentUrl).hostname === cond.value; } catch { match = false; }
          break;
      }
      if (!match) { allMatch = false; break; }
    }
    if (!allMatch) return;
  }
  
  // Execute action
  switch (hk.action) {
    case 'newTab': createTab('brows://newtab'); break;
    case 'closeTab': if (activeTabId) closeTab(activeTabId); break;
    case 'reload': getActiveTab()?.webview.reload(); break;
    case 'focusAddress': addressInput.focus(); addressInput.select(); break;
    case 'back': getActiveTab()?.webview.goBack(); break;
    case 'forward': getActiveTab()?.webview.goForward(); break;
    case 'home': navigateActive(resolveHomepage()); break;
  }
});

// ---------- Notes management ----------
let editingNoteId = null;
const notesList = document.getElementById('notes-list');
const noteEditor = document.getElementById('note-editor');
const noteTitleInput = document.getElementById('note-title-input');
const noteContentInput = document.getElementById('note-content-input');
const addNoteBtn = document.getElementById('add-note-btn');
const saveNoteBtn = document.getElementById('save-note-btn');
const cancelNoteBtn = document.getElementById('cancel-note-btn');
const deleteNoteBtn = document.getElementById('delete-note-btn');

async function loadNotes() {
  const notes = await window.browsAPI.getNotes();
  notesList.innerHTML = '';
  
  if (notes.length === 0) {
    notesList.innerHTML = '<p class="empty-message">Нет заметок</p>';
    return;
  }
  
  // Sort by updated date descending
  notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  
  notes.forEach(note => {
    const div = document.createElement('div');
    div.className = 'note-item';
    div.innerHTML = `
      <div class="note-title">${escapeHtml(note.title || 'Без названия')}</div>
      <div class="note-preview">${escapeHtml((note.content || '').substring(0, 100))}${(note.content || '').length > 100 ? '...' : ''}</div>
      <div class="note-date">${new Date(note.updatedAt).toLocaleDateString('ru-RU')}</div>
    `;
    div.addEventListener('click', () => editNote(note));
    notesList.appendChild(div);
  });
}

function editNote(note) {
  editingNoteId = note.id;
  noteTitleInput.value = note.title || '';
  noteContentInput.value = note.content || '';
  noteEditor.classList.remove('hidden');
  notesList.classList.add('hidden');
  document.querySelector('.notes-toolbar').classList.add('hidden');
}

addNoteBtn.addEventListener('click', () => {
  editingNoteId = null;
  noteTitleInput.value = '';
  noteContentInput.value = '';
  noteEditor.classList.remove('hidden');
  notesList.classList.add('hidden');
  document.querySelector('.notes-toolbar').classList.add('hidden');
});

saveNoteBtn.addEventListener('click', async () => {
  const title = noteTitleInput.value.trim();
  const content = noteContentInput.value.trim();
  
  if (editingNoteId) {
    await window.browsAPI.updateNote(editingNoteId, { title, content });
  } else {
    await window.browsAPI.addNote({ title, content });
  }
  
  noteEditor.classList.add('hidden');
  notesList.classList.remove('hidden');
  document.querySelector('.notes-toolbar').classList.remove('hidden');
  await loadNotes();
});

cancelNoteBtn.addEventListener('click', () => {
  noteEditor.classList.add('hidden');
  notesList.classList.remove('hidden');
  document.querySelector('.notes-toolbar').classList.remove('hidden');
});

deleteNoteBtn.addEventListener('click', async () => {
  if (editingNoteId && confirm('Удалить эту заметку?')) {
    await window.browsAPI.deleteNote(editingNoteId);
    noteEditor.classList.add('hidden');
    notesList.classList.remove('hidden');
    document.querySelector('.notes-toolbar').classList.remove('hidden');
    await loadNotes();
  }
});

// ---------- Privacy settings ----------
const blockTrackersToggle = document.getElementById('block-trackers-toggle');

async function loadPrivacySettings() {
  const settings = await window.browsAPI.getSettings();
  blockTrackersToggle.checked = settings.privacy?.blockTrackers || false;
}

blockTrackersToggle.addEventListener('change', async (e) => {
  const settings = await window.browsAPI.getSettings();
  settings.privacy = settings.privacy || {};
  settings.privacy.blockTrackers = e.target.checked;
  await window.browsAPI.setSettings(settings);
});

// ---------- Init ----------
(async function initSettingsPanel() {
  await loadExtensions();
  await loadHotkeys();
  await loadNotes();
  await loadPrivacySettings();
})();
