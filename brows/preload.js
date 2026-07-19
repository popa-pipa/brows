const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browsAPI', {
  // управление окном
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // настройки (сохраняются на диске, переживают перезапуск)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),

  // расширения
  getExtensions: () => ipcRenderer.invoke('extensions:getAll'),
  setExtensionEnabled: (extId, enabled) => ipcRenderer.invoke('extensions:setEnabled', extId, enabled),

  // горячие клавиши
  getHotkeys: () => ipcRenderer.invoke('hotkeys:get'),
  setHotkeys: (hotkeys) => ipcRenderer.invoke('hotkeys:set', hotkeys),
  refreshHotkeys: () => ipcRenderer.invoke('hotkeys:refresh'),
  onHotkeyTriggered: (callback) => ipcRenderer.on('hotkey:triggered', callback),

  // заметки
  getNotes: () => ipcRenderer.invoke('notes:get'),
  setNotes: (notes) => ipcRenderer.invoke('notes:set', notes),
  addNote: (note) => ipcRenderer.invoke('notes:add', note),
  updateNote: (id, updates) => ipcRenderer.invoke('notes:update', id, updates),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id)
});
