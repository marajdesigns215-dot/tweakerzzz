'use strict';
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { nativeError } = require('./native-errors.cjs');
const { peripheralQuery } = require('./peripheral-query.cjs');
const { identifyPeripherals } = require('./peripherals.cjs');

// These are fixed, read-only Windows commands. No renderer text, registry path,
// file content, or downloaded .ps1 script is evaluated by the inventory scanner.
const cim = (name, fields, filter = '') => `$rows = @(try { Get-CimInstance -ClassName ${name} ${filter ? `-Filter '${filter}'` : ''} -OperationTimeoutSec 6 -ErrorAction Stop } catch { Get-WmiObject -Class ${name} ${filter ? `-Filter '${filter}'` : ''} -ErrorAction Stop }); $rows | Select-Object ${fields}`;
const QUERIES = Object.freeze({
  cpu: cim('Win32_Processor', 'Name,NumberOfCores,NumberOfLogicalProcessors'),
  memory: cim('Win32_PhysicalMemory', 'Capacity,ConfiguredClockSpeed,Speed'),
  os: cim('Win32_OperatingSystem', 'Caption,BuildNumber'),
  gpu: cim('Win32_VideoController', 'Name,PNPDeviceID'),
  storage: cim('Win32_LogicalDisk', 'Size,FreeSpace', 'DriveType=3'),
  peripherals: peripheralQuery,
});

function execute(file, args, { timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, shell: false, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        let detail = stderr || error.message;
        try { detail = JSON.parse(stdout.trim()).error || detail; } catch { /* Prefer stderr when the command could not start. */ }
        return reject(nativeError(error.killed ? `The Windows query did not respond within ${timeoutMs / 1000} seconds.` : detail, 'Windows query'));
      }
      resolve(stdout);
    });
  });
}

function createScanner({ host = os, run = execute, exists = fs.existsSync, environment = process.env, now = () => new Date().toISOString() } = {}) {
  const systemRoot = environment.SystemRoot || 'C:\\Windows';
  const powershell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const number = value => (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) ? Number(value) : null;
  const roundGB = bytes => bytes === null ? null : Math.round(bytes / 1024 ** 3 * 10) / 10;
  const text = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 250) : fallback;

  function requireWindows() { if (host.platform() !== 'win32') throw new Error('Hardware scanning requires the Windows desktop app.'); }
  async function query(component) {
    if (!Object.hasOwn(QUERIES, component)) throw new Error('Unsupported inventory query.');
    const command = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); try { $data = @(& { ${QUERIES[component]} }); [Console]::Out.WriteLine((@{ ok = $true; data = $data } | ConvertTo-Json -Depth 5 -Compress)) } catch { [Console]::Out.WriteLine((@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)); exit 1 }`;
    const raw = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { timeoutMs: component === 'peripherals' ? 25000 : 12000 });
    let parsed;
    try { parsed = JSON.parse(raw.replace(/^\uFEFF/, '').trim()); } catch { throw new Error('The Windows inventory provider returned an invalid response.'); }
    if (!parsed.ok) throw nativeError(parsed.error, component);
    if (!Array.isArray(parsed.data)) throw new Error('The Windows inventory provider did not return a device list.');
    return parsed.data.filter(item => item && typeof item === 'object');
  }
  async function scanPeripherals() {
    requireWindows();
    try { return { peripherals: identifyPeripherals(await query('peripherals')), scannedAt: now(), warnings: [] }; }
    catch (error) { throw nativeError(error.message, 'Peripheral scan failed'); }
  }
  async function scanSystem() {
    requireWindows();
    const warnings = [];
    const names = Object.keys(QUERIES);
    const answers = await Promise.allSettled(names.map(query));
    const data = {};
    answers.forEach((answer, i) => {
      data[names[i]] = answer.status === 'fulfilled' ? answer.value : [];
      if (answer.status === 'rejected') warnings.push({ component: names[i], message: String(answer.reason.message || answer.reason).slice(0, 2000) });
    });
    const localCpu = host.cpus();
    const cores = data.cpu.length ? data.cpu.reduce((sum, cpu) => sum + (number(cpu.NumberOfCores) || 0), 0) || null : null;
    const threads = data.cpu.reduce((sum, cpu) => sum + (number(cpu.NumberOfLogicalProcessors) || 0), 0) || localCpu.length || null;
    const ram = data.memory.reduce((sum, module) => sum + (number(module.Capacity) || 0), 0) || host.totalmem();
    const speed = data.memory.map(module => number(module.ConfiguredClockSpeed) || number(module.Speed)).find(value => value > 0) || null;
    const gpu = data.gpu.find(item => /VEN_10DE|VEN_1002/i.test(item.PNPDeviceID || '')) || data.gpu[0];
    let vramGB = null;
    if (gpu && /NVIDIA/i.test(gpu.Name)) {
      const smi = [path.win32.join(systemRoot, 'System32', 'nvidia-smi.exe'), path.win32.join(environment.ProgramFiles || 'C:\\Program Files', 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe')].find(exists);
      if (smi) {
        try {
          const rows = (await run(smi, ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'])).trim().split(/\r?\n/);
          const parts = rows.map(row => row.split(',')).find(row => row[0].trim() === gpu.Name.trim());
          if (parts && number(parts[1]?.trim()) > 0) vramGB = Math.round(Number(parts[1].trim()) / 1024 * 10) / 10;
        } catch (error) { warnings.push({ component: 'gpu-memory', message: `VRAM could not be read. ${String(error.message).slice(0, 1800)}` }); }
      }
    }
    const disks = data.storage.filter(disk => number(disk.Size) !== null && number(disk.FreeSpace) !== null);
    const totalGB = disks.length ? roundGB(disks.reduce((sum, disk) => sum + Number(disk.Size), 0)) : null;
    const freeGB = disks.length ? roundGB(disks.reduce((sum, disk) => sum + Number(disk.FreeSpace), 0)) : null;
    return {
      cpu: { name: text(data.cpu[0]?.Name, text(localCpu[0]?.model, 'Processor not reported')), cores, threads },
      gpu: { name: text(gpu?.Name, 'Graphics not reported'), vramGB },
      memory: { totalGB: roundGB(ram), speedMHz: speed },
      os: { name: text(data.os[0]?.Caption, host.version()), build: text(data.os[0]?.BuildNumber, host.release()) },
      storage: { totalGB, freeGB: totalGB !== null && freeGB !== null ? Math.min(totalGB, freeGB) : null },
      peripherals: identifyPeripherals(data.peripherals), scannedAt: now(), warnings,
    };
  }
  return { scanSystem, scanPeripherals };
}

module.exports = { createScanner, execute, ...createScanner() };
