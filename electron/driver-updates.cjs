'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const { execute } = require('./scanner.cjs');
const sources = require('./driver-sources.json');
const query = `
$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function Read-Property($item,$name) { try { $item.$name } catch { $null } }
function Read-Date($item,$name) { $value=Read-Property $item $name; if ($value -is [DateTime]) {$value.ToString('yyyy-MM-dd')} }
$session=New-Object -ComObject Microsoft.Update.Session
$session.ClientApplicationID='Tweakerzzz read-only driver availability'
$searcher=$session.CreateUpdateSearcher()
$searcher.Online=$true
$result=$searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Driver'")
$packages=@()
for ($i=0; $i -lt [Math]::Min($result.Updates.Count,200); $i++) {
  $u=$result.Updates.Item($i)
  $packages+=@{updateId=$u.Identity.UpdateID;revision=$u.Identity.RevisionNumber;title=$u.Title;description=$u.Description;
    manufacturer=(Read-Property $u 'DriverManufacturer');model=(Read-Property $u 'DriverModel');driverClass=(Read-Property $u 'DriverClass');hardwareId=(Read-Property $u 'DriverHardwareID');
    driverDate=(Read-Date $u 'DriverVerDate');catalogDate=(Read-Date $u 'LastDeploymentChangeTime');
    urls=@($u.MoreInfoUrls | Select-Object -First 10);supportUrl=$u.SupportUrl}
}
@{resultCode=[int]$result.ResultCode;total=$result.Updates.Count;packages=$packages} | ConvertTo-Json -Depth 5 -Compress`;
const text = (v, max = 1000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
// WUA exposes the driver date, but not a general driver-version getter.
// Only accept the unambiguous four-part version suffix published in its title.
const titleVersion = title => typeof title === 'string' ? title.match(/\s-\s(\d+\.\d+\.\d+\.\d+)\s*$/)?.[1] || '' : '';
const officialHosts = new Set([...Object.values(sources).map(s => new URL(s.url).hostname.replace(/^www\./, '')), 'microsoft.com', 'aka.ms']);
function officialUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.port || !['https:', 'http:'].includes(url.protocol)) return null;
    if (![...officialHosts].some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return null;
    url.protocol = 'https:'; return url.href;
  } catch { return null; }
}
function parseOffers(raw, checkedAt) {
  if (!raw || !Array.isArray(raw.packages) || !Number.isInteger(raw.resultCode) || !Number.isInteger(raw.total)) throw new Error('Windows Update returned an invalid driver response.');
  let invalid = 0;
  const packages = raw.packages.slice(0, 200).flatMap(p => {
    if (!p || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.updateId || '') || !Number.isInteger(p.revision) || typeof p.title !== 'string') { invalid++; return []; }
    const urls = [...new Set([...(Array.isArray(p.urls) ? p.urls : []), p.supportUrl].map(officialUrl).filter(Boolean))].slice(0, 10);
    return [{ id: crypto.createHash('sha256').update(p.updateId + ':' + p.revision).digest('hex'), title: text(p.title), version: titleVersion(p.title), description: text(p.description, 16000), manufacturer: text(p.manufacturer, 250), model: text(p.model, 250), driverClass: text(p.driverClass, 100), hardwareId: text(p.hardwareId), driverDate: text(p.driverDate, 40), catalogDate: text(p.catalogDate, 40), links: urls.map(url => ({ url, label: new URL(url).hostname })) }];
  });
  return { checkedAt, complete: raw.resultCode === 2 && !invalid && raw.total === packages.length, source: 'Windows Update — configured update source', packages,
    message: raw.resultCode !== 2 || invalid || raw.total !== packages.length ? 'The update search returned partial results. Unlisted components have not been verified.' : packages.length ? 'Windows Update offers these applicable packages. They are not automatically installed and may differ from newer manufacturer releases.' : 'No driver packages were offered by the configured Windows Update source. This does not verify that your GPU, chipset or BIOS is on the latest manufacturer release.' };
}
function createDriverUpdateChecker({ run = execute, environment = process.env, now = () => new Date().toISOString() } = {}) {
  let checking = null, latest = null, controller = null;
  return {
    check() {
      if (checking) return checking;
      latest = null;
      controller = new AbortController();
      const executable = path.win32.join(environment.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      checking = run(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', query], { timeoutMs: 120000, maxBufferBytes: 8 * 1024 * 1024, signal: controller.signal })
        .then(raw => { latest = parseOffers(JSON.parse(raw.replace(/^\uFEFF/, '')), now()); return latest; })
        .finally(() => { checking = null; controller = null; });
      return checking;
    },
    link(id, index) {
      if (checking || !latest || typeof id !== 'string' || !Number.isInteger(index) || index < 0 || index >= 10) throw new Error('Check driver update offers before opening release information.');
      const url = latest.packages.find(p => p.id === id)?.links[index]?.url;
      if (!url || !officialUrl(url)) throw new Error('Official release link is unavailable.');
      return url;
    },
    isBusy: () => !!checking,
    status: () => ({ checking: !!checking, result: latest }),
    cancel: () => { controller?.abort(); },
    close: async () => { controller?.abort(); await checking?.catch(() => {}); },
  };
}
module.exports = { createDriverUpdateChecker, parseOffers, officialUrl, titleVersion, query };
