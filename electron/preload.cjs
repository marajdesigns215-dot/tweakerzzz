'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tweaker', Object.freeze({
  changePreferences: (action, ids) => ipcRenderer.invoke('tweaker:preferences', action, ids),
  listPrograms: () => ipcRenderer.invoke('tweaker:programs'),
  startCapture: input => ipcRenderer.invoke('tweaker:capture-start', input),
  stopCapture: () => ipcRenderer.invoke('tweaker:capture-stop'),
  captureStatus: () => ipcRenderer.invoke('tweaker:capture-status'),
  listCaptures: () => ipcRenderer.invoke('tweaker:capture-list'),
  deleteCapture: id => ipcRenderer.invoke('tweaker:capture-delete', id),
  exportCapture: id => ipcRenderer.invoke('tweaker:capture-export', id),
  minimizeToTray: () => ipcRenderer.invoke('tweaker:hide'),
  scan: () => ipcRenderer.invoke('tweaker:scan'),
  scanPeripherals: () => ipcRenderer.invoke('tweaker:peripherals'),
  getTweakStatus: () => ipcRenderer.invoke('tweaker:status'),
  applyTweaks: ids => ipcRenderer.invoke('tweaker:apply', ids),
  restoreBackup: id => ipcRenderer.invoke('tweaker:restore', id),
  listBackups: () => ipcRenderer.invoke('tweaker:backups'),
  openSettings: target => ipcRenderer.invoke('tweaker:settings', target),
  getDisplayModes: () => ipcRenderer.invoke('tweaker:display-modes'),
  setDisplayMode: mode => ipcRenderer.invoke('tweaker:display-set', mode),
  confirmDisplayMode: () => ipcRenderer.invoke('tweaker:display-confirm'),
}));
