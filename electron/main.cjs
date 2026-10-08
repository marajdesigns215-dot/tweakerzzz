'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { validateTweakIds, validateBackupId, validateSettingsTarget, validateDisplayMode } = require('./validation.cjs');
const { scanSystem, scanPeripherals } = require('./scanner.cjs');
const { nativeError } = require('./native-errors.cjs');
const { getTweakStatus } = require('./tweak-status.cjs');
const { listBackups } = require('./backups.cjs');
const { createCaptureManager, listPrograms } = require('./capture.cjs');
const collector = require('./presentmon.json');
let capture, tray, captureStart;

let window;
let nativeBusy = false;
let pendingDisplay = null;
let quitting = false;
let statusRequest = null;
const development = !app.isPackaged && process.argv.includes('--dev');
const entry = development ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;

function requireWindows() {
  if (process.platform !== 'win32') throw new Error('This feature requires the Windows desktop app. Browser preview does not change your PC.');
}

function requireTrustedSender(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('Untrusted request.');
  }
  const url = event.senderFrame.url;
  if (development ? new URL(url).origin !== 'http://127.0.0.1:5173' : url.split('#')[0] !== entry) {
    throw new Error('Untrusted application origin.');
  }
}

function native(script, payload = {}) {
  requireWindows();
  return new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const scriptRoot = app.isPackaged ? path.join(process.resourcesPath, 'windows') : path.join(__dirname, '..', 'scripts', 'windows');
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', path.join(scriptRoot, script)], {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error ? reject(error) : resolve(data);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error('The Windows operation timed out. Check Backups before retrying a change.'));
    }, 120000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 2 * 1024 * 1024) {
        child.kill();
        finish(new Error('Windows returned too much data.'));
      }
    });
    child.stderr.on('data', chunk => { if (stderr.length < 16000) stderr += chunk; });
    child.on('error', error => finish(error));
    // PowerShell may close stdin early when a trust policy blocks the script.
    // Keep its stderr so the user sees the actual cause instead of EPIPE.
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') finish(nativeError(error.message)); });
    child.on('close', code => {
      try {
        const response = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
        if (!response.ok) throw new Error(response.error || 'The Windows operation failed.');
        if (code !== 0) throw new Error('The Windows operation exited unexpectedly.');
        finish(null, response.data);
      } catch (error) {
        finish(nativeError(error instanceof SyntaxError ? stderr || 'Windows returned no valid response.' : error.message));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

async function exclusive(action) {
  if (nativeBusy) throw new Error('Another Windows change is still running. Please wait.');
  nativeBusy = true;
  try { return await action(); } finally { nativeBusy = false; }
}

async function revertDisplay() {
  const pending = pendingDisplay;
  if (!pending) return;
  if (!pending.decision) {
    pending.decision = 'cancel';
    pending.child.stdin.end('cancel\n');
  }
  try {
    await pending.completed;
  } catch (error) {
    dialog.showErrorBox('Display restore needs attention', `${error.message}\nOpen Windows Display Settings to restore your preferred resolution. A temporary change is not saved across sign-out.`);
    throw error;
  }
}

function beginDisplayTest(mode) {
  requireWindows();
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const scriptRoot = app.isPackaged ? path.join(process.resourcesPath, 'windows') : path.join(__dirname, '..', 'scripts', 'windows');
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', path.join(scriptRoot, 'display.ps1')], {
    windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let readyResolve, readyReject, completeResolve, completeReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const completed = new Promise((resolve, reject) => { completeResolve = resolve; completeReject = reject; });
  // Automatic rollback may complete without a renderer waiting on it.
  completed.catch(() => {});
  const pending = { child, completed, applied: false, decision: null, deadline: 0 };
  pendingDisplay = pending;
  let buffer = '', stderr = '', finalEvent = null, operationError = null, done = false;
  function finish(error) {
    if (done) return;
    done = true;
    if (pendingDisplay === pending) pendingDisplay = null;
    if (error) {
      readyReject(error);
      completeReject(error);
      if (pending.applied && !pending.decision) dialog.showErrorBox('Display test failed', error.message);
    } else {
      if (!pending.applied) readyReject(new Error('The display test ended before applying a mode.'));
      completeResolve(finalEvent);
    }
  }
  function consume(line) {
    if (!line.trim()) return;
    try {
      const response = JSON.parse(line.replace(/^\uFEFF/, ''));
      if (!response.ok) { operationError = new Error(response.error || 'Display test failed.'); return; }
      const event = response.data?.event;
      if (event === 'applied') {
        pending.applied = true;
        pending.deadline = Date.now() + 15000;
        readyResolve({ message: 'Display changed temporarily. Confirm within 15 seconds to keep it; otherwise the original mode returns.' });
      } else if (event === 'confirmed' || event === 'reverted') finalEvent = event;
      else operationError = new Error('Windows returned an unexpected display response.');
    } catch { operationError = new Error('Windows returned an unreadable display response.'); }
  }
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 2 * 1024 * 1024) {
      operationError = new Error('Windows returned too much display data.');
      child.stdin.end(); // EOF asks the independent helper to roll back.
      return;
    }
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  });
  child.stderr.on('data', chunk => { if (stderr.length < 16000) stderr += chunk; });
  child.on('error', finish);
  child.stdin.on('error', error => {
    // EPIPE can mean the native timeout already restored the display. Wait
    // for its final response instead of reporting a false failed restore.
    if (error.code !== 'EPIPE') operationError = error;
  });
  child.on('close', code => {
    consume(buffer);
    finish(operationError || (code !== 0 || !finalEvent ? new Error(`The Windows display helper exited unexpectedly.${stderr ? ' ' + stderr.trim().slice(0, 1000) : ''}`) : null));
  });
  // Keep stdin open: the native helper owns both the original mode and its
  // 15-second timeout. EOF (including an Electron crash) means revert.
  child.stdin.write(JSON.stringify({ action: 'test', mode }) + '\n');
  return ready;
}

function showWindow() {
  if (!window || window.isDestroyed()) createWindow();
  window.show(); if (window.isMinimized()) window.restore(); window.focus();
}
function updateTray() {
  if (!tray) return;
  const active = capture?.isActive();
  tray.setToolTip(active ? 'Tweakerzzz — recording FPS' : 'Tweakerzzz');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Tweakerzzz', click: showWindow },
    { label: 'Stop FPS recording', enabled: !!active, click: () => capture.stop().catch(error => dialog.showErrorBox('FPS recording', error.message)) },
    { type: 'separator' }, { label: 'Quit Tweakerzzz', click: () => app.quit() },
  ]));
}
function ensureNotRecording() {
  if (capture?.isActive()) throw new Error('Stop the FPS recording before changing settings so the run keeps one configuration.');
}
function registerHandlers() {
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    requireTrustedSender(event);
    requireWindows();
    return fn(...args);
  });
  const backupDirectory = path.join(app.getPath('userData'), 'backups');
  handle('tweaker:scan', () => scanSystem());
  handle('tweaker:peripherals', () => scanPeripherals());
  handle('tweaker:status', () => {
    if (!statusRequest) statusRequest = exclusive(() => getTweakStatus()).finally(() => { statusRequest = null; });
    return statusRequest;
  });
  handle('tweaker:apply', ids => {
    const approved = validateTweakIds(ids);
    return exclusive(() => { ensureNotRecording(); return native('tweaks.ps1', { action: 'apply', ids: approved, backupDirectory }); });
  });
  handle('tweaker:restore', id => {
    const approved = validateBackupId(id);
    return exclusive(() => { ensureNotRecording(); return native('tweaks.ps1', { action: 'restore', id: approved, backupDirectory }); });
  });
  handle('tweaker:backups', () => listBackups(backupDirectory));
  handle('tweaker:preferences', (action, ids) => {
    if (!['disable', 'defaults', 'snapshot'].includes(action)) throw new Error('Unsupported preference action.');
    const approved = validateTweakIds(ids);
    return exclusive(() => { ensureNotRecording(); return native('tweaks.ps1', { action, ids: approved, backupDirectory }); });
  });
  handle('tweaker:programs', () => listPrograms());
  handle('tweaker:capture-start', input => {
    captureStart = exclusive(() => {
      if (pendingDisplay) throw new Error('Finish the display test before recording.');
      return capture.start(input);
    }).finally(() => { captureStart = null; });
    return captureStart;
  });
  handle('tweaker:capture-stop', () => capture.stop());
  handle('tweaker:capture-status', () => capture.status());
  handle('tweaker:capture-list', () => capture.list());
  handle('tweaker:capture-delete', id => capture.remove(id));
  handle('tweaker:capture-export', async id => {
    const source = await capture.csvPath(id);
    const result = await dialog.showSaveDialog(window, { title: 'Export PresentMon frame data', defaultPath: `Tweakerzzz-${id}.csv`, filters: [{ name: 'CSV frame data', extensions: ['csv'] }] });
    if (!result.canceled && result.filePath) await fs.promises.copyFile(source, result.filePath);
  });
  handle('tweaker:hide', () => {
    if (!tray || pendingDisplay) throw new Error('Finish any display test before minimizing to the tray.');
    window.hide();
  });
  handle('tweaker:settings', async target => {
    const destination = validateSettingsTarget(target);
    if (destination === 'protection') {
      const error = await shell.openPath(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'SystemPropertiesProtection.exe'));
      if (error) throw new Error(error);
      return;
    }
    if (destination === 'nvidia') {
      const candidate = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'NVIDIA Corporation', 'Control Panel Client', 'nvcplui.exe');
      if (fs.existsSync(candidate)) {
        const error = await shell.openPath(candidate);
        if (error) throw new Error(error);
      } else {
        await native('settings.ps1', { target: 'nvidia' });
      }
      return;
    }
    await shell.openExternal(destination);
  });
  handle('tweaker:display-modes', () => native('display.ps1', { action: 'list' }));
  handle('tweaker:display-set', input => {
    const mode = validateDisplayMode(input);
    return exclusive(async () => {
      ensureNotRecording();
      await revertDisplay();
      return beginDisplayTest(mode);
    });
  });
  handle('tweaker:display-confirm', () => exclusive(async () => {
    const pending = pendingDisplay;
    if (!pending || !pending.applied || pending.decision || Date.now() >= pending.deadline) throw new Error('The display test expired. Test the mode again.');
    pending.decision = 'confirm';
    pending.child.stdin.end('confirm\n');
    const outcome = await pending.completed;
    if (outcome !== 'confirmed') throw new Error('The display test expired and the original mode was restored.');
  }));
}

function createWindow() {
  window = new BrowserWindow({
    width: 1480, height: 950, minWidth: 900, minHeight: 640,
    backgroundColor: '#0b0d10', title: 'TWEAKERZZZ', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== entry) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.on('render-process-gone', () => { revertDisplay().catch(() => {}); });
  window.on('close', event => { if (!quitting && capture?.isActive() && tray) { event.preventDefault(); window.hide(); } });
  window.loadURL(entry);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    showWindow();
  });
  app.whenReady().then(() => {
    capture = createCaptureManager({
      directory: path.join(app.getPath('userData'), 'recordings'),
      executable: app.isPackaged ? path.join(process.resourcesPath, 'presentmon', collector.file) : path.join(__dirname, '..', 'vendor', 'presentmon', collector.file),
      snapshot: getTweakStatus,
      onChange: record => { updateTray(); if (record?.status === 'failed' && window && !window.isVisible()) showWindow(); },
    });
    registerHandlers();
    createWindow();
    tray = new Tray(app.isPackaged ? path.join(process.resourcesPath, 'app.ico') : path.join(__dirname, '..', 'build', 'icon.ico'));
    tray.on('double-click', showWindow);
    updateTray();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('before-quit', event => {
  if (quitting) return;
  quitting = true;
  if (!pendingDisplay && !capture?.isActive()) return;
  event.preventDefault();
  Promise.resolve(captureStart).catch(() => {}).then(() => Promise.allSettled([revertDisplay(), capture.stop()])).finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
