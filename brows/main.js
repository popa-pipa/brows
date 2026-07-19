const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_PATH = path.join(app.getPath('userData'), 'brows-settings.json');
const EXTENSIONS_PATH = path.join(app.getPath('userData'), 'brows-extensions.json');
const HOTKEYS_PATH = path.join(app.getPath('userData'), 'brows-hotkeys.json');
const NOTES_PATH = path.join(app.getPath('userData'), 'brows-notes.json');
const MODS_DIR = path.join(__dirname, 'mods');

const DEFAULT_SETTINGS = {
  searchEngine: 'google', // 'google' | 'yandex' | 'bing' | 'duckduckgo'
  homepage: 'brows://newtab',
  theme: {
    accent: '#ffb020',
    chromeBg: '#14161c',
    chromeBg2: '#1c1f28',
    tabActive: '#20232d',
    text: '#e7e7ea',
    textDim: '#8b8d98',
    radius: 10,
    density: 'comfortable', // 'comfortable' | 'compact'
    font: 'ui'
  },
  newtab: {
    bgType: 'gradient', // 'gradient' | 'solid' | 'image'
    bgValue: 'linear-gradient(135deg,#14161c,#1f2333 60%,#2a2140)',
    shortcuts: [
      { name: 'YouTube', url: 'https://youtube.com' },
      { name: 'GitHub', url: 'https://github.com' },
      { name: 'Yandex', url: 'https://ya.ru' },
      { name: 'Google', url: 'https://google.com' }
    ]
  },
  privacy: {
    blockTrackers: false
  }
};

const DEFAULT_EXTENSIONS = {
  adblock: { enabled: true, id: 'adblock' }
};

const DEFAULT_HOTKEYS = [];

const DEFAULT_NOTES = [];

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed,
      theme: { ...DEFAULT_SETTINGS.theme, ...(parsed.theme || {}) },
      newtab: { ...DEFAULT_SETTINGS.newtab, ...(parsed.newtab || {}) }
    };
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 480,
    frame: false, // собственная рамка/шапка — под визуальную кастомизацию
    backgroundColor: '#14161c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // разрешаем <webview> для вкладок
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'browser.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: настройки ----
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (_evt, settings) => {
  saveSettings(settings);
  return true;
});
ipcMain.handle('settings:reset', () => {
  saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
});

// ---- Extensions management ----
function loadExtensions() {
  try {
    const raw = fs.readFileSync(EXTENSIONS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { ...DEFAULT_EXTENSIONS };
  }
}

function saveExtensions(exts) {
  fs.writeFileSync(EXTENSIONS_PATH, JSON.stringify(exts, null, 2), 'utf-8');
}

function scanModsDirectory() {
  const extensions = [];
  if (!fs.existsSync(MODS_DIR)) return extensions;
  
  const items = fs.readdirSync(MODS_DIR);
  for (const item of items) {
    const extPath = path.join(MODS_DIR, item);
    if (fs.statSync(extPath).isDirectory()) {
      const infoPath = path.join(extPath, 'info');
      if (fs.existsSync(infoPath)) {
        try {
          const infoRaw = fs.readFileSync(infoPath, 'utf-8');
          const info = JSON.parse(infoRaw);
          extensions.push({
            id: item,
            name: info.name || item,
            description: info.description || '',
            author: info.author || '',
            version: info.version || '1.0.0',
            hasLogic: fs.existsSync(path.join(extPath, 'logic')),
            hasIcon: fs.existsSync(path.join(extPath, 'icon'))
          });
        } catch (e) {
          // Invalid info file
        }
      }
    }
  }
  return extensions;
}

ipcMain.handle('extensions:getAll', () => {
  const scanned = scanModsDirectory();
  const saved = loadExtensions();
  return scanned.map(ext => ({
    ...ext,
    enabled: saved[ext.id]?.enabled ?? (ext.id === 'adblock' ? true : false)
  }));
});

ipcMain.handle('extensions:setEnabled', (_evt, extId, enabled) => {
  const exts = loadExtensions();
  exts[extId] = { ...(exts[extId] || {}), id: extId, enabled };
  saveExtensions(exts);
  
  // Apply adblock state to session
  if (extId === 'adblock') {
    applyAdBlockFilter(enabled);
  }
  
  return true;
});

function applyAdBlockFilter(enabled) {
  const ses = session.defaultSession;
  if (enabled) {
    const TRACKER_PATTERNS = [
      '*://*.google-analytics.com/*',
      '*://*.doubleclick.net/*',
      '*://*.facebook.net/*',
      '*://*.fbcdn.net/*',
      '*://*.hotjar.com/*',
      '*://*.hotjar.io/*',
      '*://*.optimizely.com/*',
      '*://*.segment.com/*',
      '*://*.amplitude.com/*',
      '*://*.mixpanel.com/*',
      '*://*.taboola.com/*',
      '*://*.outbrain.com/*',
      '*://*.ads.yahoo.com/*',
      '*://*.adnxs.com/*',
      '*://*.rubiconproject.com/*',
      '*://*.pubmatic.com/*',
      '*://*.casalemedia.com/*',
      '*://*.quantserve.com/*',
      '*://*.scorecardresearch.com/*',
      '*://*.krxd.net/*',
      '*://*.bluekai.com/*',
      '*://*.exelator.com/*',
      '*://*.turn.com/*',
      '*://*.media.net/*',
      '*://*.adsrvr.org/*',
      '*://*.mathtag.com/*',
      '*://*.demdex.net/*',
      '*://*.everesttech.net/*',
      '*://*.rlcdn.com/*',
      '*://*.tapad.com/*',
      '*://*.adsymptotic.com/*',
      '*://*.contextweb.com/*',
      '*://*.yieldmo.com/*'
    ];
    
    // Remove existing filters first
    ses.protocol.unregisterProtocol('brows-adblock').catch(() => {});
    
    for (const pattern of TRACKER_PATTERNS) {
      ses.webRequest.onBeforeRequest({ urls: [pattern] }, (details, callback) => {
        callback({ cancel: true });
      });
    }
  }
}

// ---- Hotkeys management ----
function loadHotkeys() {
  try {
    const raw = fs.readFileSync(HOTKEYS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [...DEFAULT_HOTKEYS];
  }
}

function saveHotkeys(hotkeys) {
  fs.writeFileSync(HOTKEYS_PATH, JSON.stringify(hotkeys, null, 2), 'utf-8');
}

ipcMain.handle('hotkeys:get', () => loadHotkeys());
ipcMain.handle('hotkeys:set', (_evt, hotkeys) => {
  saveHotkeys(hotkeys);
  return true;
});

// Register global hotkeys
function registerGlobalHotkeys(hotkeys) {
  // Clear existing
  const registered = [];
  for (const hk of hotkeys) {
    if (hk.enabled !== false && hk.accelerator) {
      try {
        const success = globalShortcut.register(hk.accelerator, () => {
          mainWindow?.webContents.send('hotkey:triggered', hk);
        });
        if (success) registered.push(hk.accelerator);
      } catch (e) {
        // Failed to register
      }
    }
  }
  return registered;
}

const { globalShortcut } = require('electron');

app.whenReady().then(() => {
  createWindow();
  
  // Initialize adblock if enabled
  const exts = loadExtensions();
  if (exts.adblock?.enabled !== false) {
    applyAdBlockFilter(true);
  }
  
  // Load and register hotkeys
  const hotkeys = loadHotkeys();
  registerGlobalHotkeys(hotkeys);
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Re-register hotkeys when they change
ipcMain.handle('hotkeys:refresh', () => {
  globalShortcut.unregisterAll();
  const hotkeys = loadHotkeys();
  return registerGlobalHotkeys(hotkeys);
});

// ---- Notes management ----
function loadNotes() {
  try {
    const raw = fs.readFileSync(NOTES_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [...DEFAULT_NOTES];
  }
}

function saveNotes(notes) {
  fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2), 'utf-8');
}

ipcMain.handle('notes:get', () => loadNotes());
ipcMain.handle('notes:set', (_evt, notes) => {
  saveNotes(notes);
  return true;
});
ipcMain.handle('notes:add', (_evt, note) => {
  const notes = loadNotes();
  note.id = Date.now().toString();
  note.createdAt = new Date().toISOString();
  note.updatedAt = note.createdAt;
  notes.push(note);
  saveNotes(notes);
  return note;
});
ipcMain.handle('notes:update', (_evt, id, updates) => {
  const notes = loadNotes();
  const idx = notes.findIndex(n => n.id === id);
  if (idx !== -1) {
    notes[idx] = { ...notes[idx], ...updates, updatedAt: new Date().toISOString() };
    saveNotes(notes);
    return notes[idx];
  }
  return null;
});
ipcMain.handle('notes:delete', (_evt, id) => {
  const notes = loadNotes();
  const filtered = notes.filter(n => n.id !== id);
  saveNotes(filtered);
  return true;
});

// ---- IPC: управление окном (своя шапка) ----
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
