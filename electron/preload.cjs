'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tweaker', Object.freeze({
  scan: () => ipcRenderer.invoke('tweaker:scan'),
  applyTweaks: ids => ipcRenderer.invoke('tweaker:apply', ids),
  restoreBackup: id => ipcRenderer.invoke('tweaker:restore', id),
  listBackups: () => ipcRenderer.invoke('tweaker:backups'),
  openSettings: target => ipcRenderer.invoke('tweaker:settings', target),
  getDisplayModes: () => ipcRenderer.invoke('tweaker:display-modes'),
  setDisplayMode: mode => ipcRenderer.invoke('tweaker:display-set', mode),
  confirmDisplayMode: () => ipcRenderer.invoke('tweaker:display-confirm'),
}));
