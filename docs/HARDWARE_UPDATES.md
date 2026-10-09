# Hardware, update offers and change history

In **Drivers & devices**, choose **Scan drivers & devices**. The main Hardware view shows graphics cards, processors, motherboard/system, BIOS/UEFI, RAM modules, storage firmware, and identifiable network/audio/platform components. It uses this PC's Windows reports, with no sample/reference build. Multiple GPUs and CPU sockets are supported when reported. Unknown manufacturers and unavailable fields remain unidentified.

## What an update check establishes

**Update offers → Check driver update offers** performs a read-only Windows Update Agent search for uninstalled, non-hidden driver packages applicable to this PC. Firmware packages can appear when the configured source offers them. The app respects the configured Windows Update source and organizational policy; it does not switch update servers, enable services, download driver packages, install them, or flash firmware. Cancel stops the app's query process. Update checks and hardware scans cannot start during an FPS recording; finish an active scan/check before starting one.

The result includes the published package title, provider/model information where supplied, published dates, publisher description, and recognized official release-information links. A separate version number is not invented if the source supplies it only in the title. Hardware associations use exact reported IDs; an unassociated offer remains an offer for the PC, not a guessed match to a component. Offers are held in memory until another check or app exit; the displayed timestamp matters.

**This is not a universal manufacturer-latest check.** NVIDIA/AMD/Intel releases, chipset bundles, peripheral utilities, and motherboard BIOS releases may be newer than—or entirely absent from—Windows Update. No offers, a failed search, or a partial response never marks every component up to date. Available offers can also include optional/alternative packages; read the publisher's prerequisites before choosing a manual update.

Hardware cards open an allowlisted official manufacturer support directory. Select the exact model, motherboard revision, OEM system, Windows version and driver branch there to see available versions and full release notes. These links are not verified exact-model downloads or an archive of manufacturer changelogs. In-app Windows Update package descriptions can be brief and are not a substitute for full manufacturer release notes. Vendor-specific live latest-version adapters are not included in this release.

CPUs normally receive platform support through chipset packages and motherboard BIOS/microcode, not a separate gaming CPU driver. RAM generally has no separate driver. Ordinary fan models and header wiring usually cannot be enumerated; identifiable USB cooling controllers can have official utility links. Detected components do not establish compatible firmware by themselves.

## PC change history

The first **complete** inventory scan saves a baseline. Later complete scans compare installed driver version, provider, date, INF, Windows-reported signature fields, device state, and selected component details. BIOS and storage firmware version differences are recorded separately. Reconnecting hardware or changing enumeration can produce first-seen/not-reported events; these do not prove installation or removal.

Each entry gives the previous observation and the time the difference was observed. It does not claim the exact installation time, and intermediate changes between scans can be missed. Partial queries, missing/duplicate identities, inventory truncation and failed scans preserve the last complete baseline instead of inventing mass removals. Component-query failures preserve the last complete component baseline independently of driver records. Clock regressions do not overwrite the baseline.

The optional **Check for changes every 15 minutes** setting is off by default. It runs local scans only while the app is open, pauses during FPS recording and app-managed Windows operations, and does not perform online update searches. No startup service is installed. Background scans update history; rescan manually to refresh the displayed hardware cards. Local scans have overhead, so perform them before benchmark baselines.

History is saved atomically in the user's app-data `driver-history/history.json`, retained across app upgrades and uninstall, and bounded to 2,000 change entries and 12 MiB (older entries are trimmed to fit). Damaged/unsupported history files are preserved and surfaced as errors. **Clear local history** requires an in-app confirmation, removes this app's baseline/history, and disables background checks; it does not delete Windows logs or modify drivers.

## Windows installation evidence

**Change history → Windows installation log → Read Windows installation log** reads the last 2 MiB of `%SystemRoot%\INF\setupapi.dev.log`, displaying at most 100 retained sections. This can provide evidence predating this app's baseline, but is not a complete historical driver database. Windows may rotate or restrict it. Local log timestamps are shown as recorded, without inventing a timezone. Section completion status and actual instance identifiers are parsed; missing versions or completion details are not reconstructed. This log is separate from manufacturer release notes and scan comparisons.

## Advanced records and exports

**Advanced records** contains the underlying Windows device/driver inventory, including controllers and software devices. Search by name, provider, version or hardware ID; results are paginated. Driver release dates are not installation dates, and signature fields come from Windows rather than independent cryptographic verification. Queries are limited to 3,000 device/driver records; an oversized result is explicitly partial and cannot replace history.

**Export hardware & driver report** saves the displayed report, retained history, checked offers and installation entries loaded in this session. Raw instance/hardware IDs are omitted by default; the opt-in checkbox includes them and may expose device serial identifiers. Model names, hashed record IDs, timestamps and version changes remain in the default export. No report is uploaded by the app. Review an export before sharing it.

## Validation and limits

Portable tests cover case-insensitive inventory joins, true provider vs. hardware manufacturer, multiple GPUs, unknown vendors, persisted/reopened history, BIOS changes, partial failures, damaged files, monitoring pauses, bounded installation-log parsing, update failures/cancellation and external-link validation. Browser tests exercise hardware categories, record pagination, update descriptions, failure states, history controls, exports and narrow layouts using explicitly labeled fixtures.

Windows CI separately validates real CIM queries, baseline persistence and a second scan, reads the retained SetupAPI log, and attempts the real read-only Windows Update query. Policy/network/service failures are recorded as unavailable rather than successful availability evidence; unexpected query failures fail validation. The installed application is exercised through its real preload/IPC bridge and upgrade tests retain driver-history data. A hosted Windows runner does not establish coverage for every physical device or vendor release feed.

## Public API references

- [Win32_PnPEntity](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-pnpentity) — hardware IDs, device classes, presence and problem codes.
- [Win32_PnPSignedDriver](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/legacy/aa394354(v=vs.85)) — installed provider/version/INF/signature metadata.
- [IUpdateSearcher::Search](https://learn.microsoft.com/en-us/windows/win32/api/wuapi/nf-wuapi-iupdatesearcher-search) — `IsInstalled=0 and IsHidden=0 and Type='Driver'`.
- [IWindowsDriverUpdate](https://learn.microsoft.com/en-us/windows/win32/api/wuapi/nn-wuapi-iwindowsdriverupdate) — driver-specific update metadata, alongside common IUpdate properties.
- [SetupAPI device installation log entries](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/setupapi-device-installation-log-entries) and [section-header format](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/format-of-a-text-log-section-header).
