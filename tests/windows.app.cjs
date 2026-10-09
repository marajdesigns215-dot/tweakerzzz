'use strict';
// Exercise the installed app through its real preload/IPC bridge. Debugging is
// enabled only by the isolated installer test, never by the shipped shortcut.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const WebSocket = require('ws');
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Run this only in isolated Windows CI.');
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Expected a local debugging port.');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) { try { const result = await fn(); if (result) return result; } catch (e) { last = e; } await pause(200); }
  throw new Error(`Timed out: ${label}${last ? ': ' + last.message : ''}`);
}
(async () => {
  const pages = await until(async () => { const r = await fetch(`http://127.0.0.1:${port}/json/list`); const rows = await r.json(); return rows.some(p => p.type === 'page' && p.url.startsWith('file:')) && rows; }, 'installed app debugging target');
  const target = pages.find(p => p.type === 'page' && p.url.startsWith('file:'));
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let sequence = 0;
  const pending = new Map(), errors = [], completed = [];
  socket.on('message', bytes => {
    const message = JSON.parse(bytes);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value ?? a.description).join(' '));
    if (message.id && pending.has(message.id)) {
      const call = pending.get(message.id); pending.delete(message.id); clearTimeout(call.timer);
      message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result);
    }
  });
  function send(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`No response: ${method}`)); }, 60000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  const click = name => evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)}); if(!b || b.disabled)throw Error('Button unavailable: '+${JSON.stringify(name)}); b.click(); return true; })()`);
  const waitFor = (expression, label) => until(() => evaluate(expression), label);
  async function nav(name) {
    await evaluate(`(() => {const b=[...document.querySelectorAll('.nav-item')].find(b=>b.textContent.includes(${JSON.stringify(name)})); if(!b)throw Error('Tab missing'); b.click();})()`);
    await waitFor(`document.querySelector('h1')?.textContent===${JSON.stringify(name === 'Overview' ? 'Make every frame pop.' : name)}`, name);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Overflow: ${name}`);
    completed.push(name);
  }
  try {
    await send('Runtime.enable'); await send('Page.enable');
    await waitFor("document.querySelector('h1')?.textContent==='Make every frame pop.'", 'app load');
    await waitFor("document.querySelector('.windows-status-bar')?.textContent.includes('22 automatic tweaks')", 'live Windows state');
    if (process.argv.includes('--relaunch')) {
      const expected = JSON.parse(await fs.readFile('release/qa/windows-memory-expected.json', 'utf8'));
      await waitFor("document.querySelector('.saved-hardware-note')?.textContent.includes('Using a saved scan')", 'saved scan after app restart');
      const saved = await evaluate('window.tweaker.getHardwareMemory()');
      assert.deepEqual(saved, expected, 'Full restart must restore the original reports and timestamps without rescanning');
      await nav('Drivers & devices');
      await waitFor("document.querySelectorAll('.component-card').length>0 && document.querySelector('main').textContent.includes('Saved driver scan')", 'driver cards restored after restart');
      await nav('PC scanner');
      await waitFor("document.querySelector('.scan-banner')?.textContent.includes('Saved native scan')", 'saved PC scan');
      await click('Forget saved scan'); await click('Forget this PC');
      await waitFor("document.querySelector('.scan-banner')?.textContent.includes('SCAN NEEDED')", 'forget saved scan');
      const cleared = await evaluate('window.tweaker.getHardwareMemory()');
      assert.deepEqual(cleared, {system:null,drivers:null,peripherals:null,warning:''});
      assert.deepEqual(errors, [], 'Restored app renderer errors');
      await fs.writeFile('release/qa/windows-memory-restart.json', JSON.stringify({restored:true,forgotten:true,originalScanAt:saved.system.scannedAt,errors},null,2));
      console.log('PASS: full installed-app restart restores PC, driver and peripheral reports with unchanged timestamps; Forget clears the saved scan.');
      return;
    }
    await nav('Overview');
    await nav('Optimizations');
    await evaluate("document.querySelector('[aria-label=\"Details for Windows Game Mode\"]').click()");
    await waitFor("!!document.querySelector('[role=dialog]')", 'tweak details');
    await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
    await nav('PC scanner'); await click('Run hardware scan');
    await waitFor("document.querySelector('.scan-banner')?.textContent.includes('REPORT LOADED')", 'native PC scan');
    const detected = await evaluate("document.querySelector('.scanner-cards').innerText");
    assert.ok(!detected.includes('Processor not scanned'));
    await nav('FPS recorder');
    await waitFor("document.querySelector('.game-advisor')?.textContent.includes('GB RAM')", 'shared hardware in recorder');
    await click('Find running programs');
    await waitFor("document.querySelectorAll('.running-program-option').length>0", 'real process enumeration');
    assert.equal(await evaluate("document.querySelectorAll('#running-programs').length"), 0, 'The unusable native autocomplete must not return');
    const programs = await evaluate('window.tweaker.listPrograms()');
    const appProcess = programs.find(name => name.toLowerCase() === 'tweakerzzz.exe');
    assert.ok(appProcess, 'The installed app must appear in the real Windows process list');
    await evaluate(`(() => { const b=[...document.querySelectorAll('.running-program-picker button')].find(b=>b.textContent.startsWith('All programs')); if(!b)throw Error('All-program filter missing'); b.click(); })()`);
    await evaluate(`(() => { const input=document.querySelector('.running-program-picker input[type=search]'); if(!input)throw Error('Search missing'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'tweakerzzz'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await waitFor(`document.querySelector('.running-program-picker input')?.value==='tweakerzzz' && [...document.querySelectorAll('.running-program-option')].every(b=>b.textContent.toLowerCase().includes('tweakerzzz'))`, 'search filters real running processes');
    await evaluate(`(() => {const b=[...document.querySelectorAll('.running-program-option')].find(b=>b.getAttribute('aria-label')===${JSON.stringify('Select ')}+${JSON.stringify(appProcess)}); if(!b)throw Error('Real target unavailable'); b.click();})()`);
    await waitFor(`document.querySelector('input[placeholder="Example: game.exe"]')?.value===${JSON.stringify(appProcess)}`, 'selected real executable');
    await fs.mkdir('release/qa', { recursive: true });
    const pickerShot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile('release/qa/windows-program-picker.png', Buffer.from(pickerShot.data, 'base64'));
    await fs.writeFile('release/qa/windows-program-picker.json', JSON.stringify({ processCount: programs.length, selected: appProcess, note: 'Real installed Windows app and process enumeration; no game capture implied.' }, null, 2));
    await nav('Display studio');
    await waitFor("!!document.querySelector('.program-colors')", 'color controls');
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='Refresh display modes' && !b.disabled)", 'display-mode query');
    const display = await evaluate(`(() => {const r=document.querySelector('[aria-label="Display resolution"]'), f=document.querySelector('[aria-label="Display refresh rate"]'), b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Test resolution')); return {resolution:r.value,rate:f.value,disabled:b.disabled};})()`);
    assert.ok(display.disabled || (/^\d+x\d+$/.test(display.resolution) && Number(display.rate) >= 23));
    // Driver scans, peripheral scans, process lists, snapshots and navigation
    // are read-only with respect to Windows settings. Never test a display change here.
    await nav('Drivers & devices'); await click('Scan drivers & devices');
    await waitFor("document.querySelectorAll('.component-card').length>0", 'live hardware component inventory');
    await click('Change history');
    await waitFor("document.querySelector('.driver-history')?.textContent.includes('Baseline saved')", 'saved live driver baseline');
    assert.equal(await evaluate("[...document.querySelectorAll('[role=tab]')].some(b=>b.textContent==='Advanced records')"), false, 'Miscellaneous driver records should be hidden');
    await click('Update offers');
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Check driver update offers') && !b.disabled)", 'manual driver update check');
    await click('Hardware');
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Check latest versions') && !b.disabled)", 'per-component latest-version control');
    assert.equal(await evaluate("[...document.querySelectorAll('.component-card > .pill')].every(p=>['Graphics','Processor','Motherboard','BIOS / UEFI','Peripherals','Audio'].includes(p.textContent))"), true);
    await click('Check latest versions');
    await waitFor("window.tweaker.getComponentUpdateStatus().then(s=>s.checking || !!s.result)", 'real latest-version IPC starts');
    await evaluate("window.tweaker.getComponentUpdateStatus().then(s=>s.checking ? window.tweaker.cancelComponentUpdates() : undefined)");
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Check latest versions') && !b.disabled)", 'version check completes or cancels');
    const hardwareShot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile('release/qa/windows-hardware.png', Buffer.from(hardwareShot.data, 'base64'));
    await nav('Peripherals'); await click('Scan devices');
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Scan devices' && !b.disabled)", 'peripheral scan');
    assert.equal(await evaluate("!!document.querySelector('[role=alert]')"), false, 'Peripheral scan failed');
    const remembered = await evaluate('window.tweaker.getHardwareMemory()');
    assert.equal(remembered.warning, '');
    assert.ok(remembered.system && remembered.drivers && remembered.peripherals, 'All three native reports must be saved');
    await fs.writeFile('release/qa/windows-memory-expected.json', JSON.stringify(remembered));
    await nav('Streaming lab');
    for (const name of ['Twitch', 'YouTube', 'Recording']) { await click(name); await waitFor(`document.querySelector('.obs-panel .pill')?.textContent===${JSON.stringify(name)}`, name + ' profile'); }
    await nav('Updates');
    const updates = await evaluate('window.tweaker.updateStatus()');
    assert.equal(updates.supported, true);
    assert.equal(updates.phase, 'idle', 'Updates must not check automatically');
    assert.equal(updates.currentVersion, require('../package.json').version);
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Check for updates') && !b.disabled)", 'manual update control');
    await nav('Restore center'); await click('Save settings snapshot');
    await waitFor("document.querySelector('.backup-list')?.textContent.includes('22 settings')", 'snapshot through real IPC');
    await fs.mkdir('release/qa', { recursive: true });
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile('release/qa/windows-app.png', Buffer.from(shot.data, 'base64'));
    assert.deepEqual(errors, [], 'Installed app renderer errors');
    await fs.writeFile('release/qa/windows-app.json', JSON.stringify({ completed, detected, display, errors, note: 'Real installed Windows app; no display, color, or registry changes applied.' }, null, 2));
    console.log('PASS: installed Windows app tabs, searchable real-process selection, live inventory/settings/drivers/peripherals, snapshot, display fallback and streaming profiles; no renderer errors.');
  } finally {
    for (const call of pending.values()) clearTimeout(call.timer);
    socket.terminate();
  }
})().catch(error => {
  const detail = String(error.stack || error).slice(0, 3000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.error(`::error title=Installed Windows app walkthrough failed::${detail}`);
  process.exitCode = 1;
});
