# Hardware versions, update offers and change history

In **Drivers & devices**, choose **Scan drivers & devices → Check latest versions**. Visible groups are graphics, processors, motherboard, BIOS/UEFI, peripherals and audio. Models and installed versions come from this PC's Windows reports, with no reference build. Multiple GPUs and CPU sockets are supported when reported. Unknown vendors and missing fields remain unidentified. Miscellaneous Windows records are hidden from the view, but retained in diagnostic inventory and exports.

## Installed and latest available

| Component | Installed information | Available-release coverage |
| --- | --- | --- |
| NVIDIA GeForce | Windows driver version and NVIDIA public version | Official live product/OS catalogs, exact model, confirmed x64 Windows 10/11, selected Game Ready WHQL or non-beta Studio branch. Beta/preview/inactive releases excluded. The source's WHQL flag is shown as reported; it is not invented for Studio. |
| AMD, Intel, other GPUs | Reported driver version for each adapter | Exact device-matched Windows Update offers; official manufacturer/OEM link when recognized. This does not verify the newest vendor release. |
| Motherboard | Manufacturer/model/revision; individually detected chipset/platform driver versions | Exact Windows Update matches for those devices. A chipset bundle is not assigned one invented motherboard version. |
| Processor | CPU model, socket, cores; identified Windows processor drivers | Matching Windows driver offers where present. CPU firmware/support also depends on chipset packages and exact-board BIOS. |
| BIOS / UEFI | Actual SMBIOS firmware version and date | Manufacturer/OEM support page. Automatic latest firmware verification is not included. A Windows firmware package's driver version is not treated as the BIOS version. |
| Peripherals / audio | Identified Windows device-driver versions | Exact Windows Update matches plus recognized manufacturer links. These are separate from device firmware and optional control-app versions. |

Every comparison uses the current native scan; the renderer cannot submit a different PC's report or an arbitrary lookup URL. Exact product/hardware IDs, OS, branch and laptop/desktop distinctions matter. Unknown or ambiguous models fail closed. Changing the NVIDIA branch or rescanning hides old comparisons. Rechecking clears stale results, cancellation does not commit partial results, and one failed provider does not erase another provider's verified result.

Manufacturer metadata is requested only after **Check latest versions**. Requests have an exact-host allowlist, HTTPS, time and size limits, no redirects/cookies, and no executable downloads. Manufacturer lookups send catalog model/OS/branch identifiers, not serial numbers or full instance IDs. Release notes are rendered as plain text. The retained latest check is in memory until another check/app exit and can be exported with its timestamp. Exact public NVIDIA site contracts can change; failures stay unverified rather than marking a device up to date.

MSI's public BIOS web catalog was investigated, but automated requests returned HTTP 403 in Windows validation. Its unverified parser is not shipped. Other manufacturer-only catalogs also remain manual until their exact matching and current response contracts are verified. This is deliberately **not universal manufacturer-latest coverage**: AMD/Intel/OEM GPU packages, chipset bundles, BIOS, peripheral firmware and utilities can be newer than—or absent from—Windows Update.

## Windows Update source

**Update offers → Check driver update offers** performs a read-only Windows Update Agent search for uninstalled, non-hidden driver packages applicable to this PC. Firmware packages can appear when the configured source offers them. The app respects the configured source and organizational policy; it does not change update servers, enable services, download/install packages, or flash firmware. Cancel stops its query process. Checks and scans cannot overlap FPS recording.

Published title, provider, dates, description and recognized official release links are retained. A separate version is extracted only from an unambiguous four-part version suffix in the package title: WUA does not expose a general installed-style DriverVersion field. Missing versions remain missing. Component associations require an exact reported hardware/compatible ID. Distinct publishers and major-version branches remain separate. Offered versions are not blindly ranked against unrelated vendor/OEM numbering systems. No offers or a failed/partial search never establishes manufacturer-latest status.

Recognized OEM support takes priority where appropriate. NVIDIA generic releases still require checking OEM/laptop prerequisites. CPUs usually receive platform support through chipset and BIOS/microcode; RAM and ordinary fans normally have no separate driver. Identifiable USB controllers may have software. Model detection alone does not establish safe firmware compatibility.

## PC change history

The first **complete** inventory scan saves a baseline. Later complete scans compare installed driver version, provider, date, INF, Windows-reported signature fields, device state, and selected component details. BIOS and storage firmware version differences are recorded separately. Reconnecting hardware or changing enumeration can produce first-seen/not-reported events; these do not prove installation or removal.

Each entry gives the previous observation and the time the difference was observed. It does not claim the exact installation time, and intermediate changes between scans can be missed. Partial queries, missing/duplicate identities, inventory truncation and failed scans preserve the last complete baseline instead of inventing mass removals. Component-query failures preserve the last complete component baseline independently of driver records. Clock regressions do not overwrite the baseline.

The optional **Check for changes every 15 minutes** setting is off by default. It runs local scans only while the app is open, pauses during FPS recording and app-managed Windows operations, and does not perform online update searches. No startup service is installed. Background scans update history; rescan manually to refresh the displayed hardware cards. Local scans have overhead, so perform them before benchmark baselines.

History is saved atomically in the user's app-data `driver-history/history.json`, retained across app upgrades and uninstall, and bounded to 2,000 change entries and 12 MiB (older entries are trimmed to fit). Damaged/unsupported history files are preserved and surfaced as errors. **Clear local history** requires an in-app confirmation, removes this app's baseline/history, and disables background checks; it does not delete Windows logs or modify drivers.

## Windows installation evidence

**Change history → Windows installation log → Read Windows installation log** reads the last 2 MiB of `%SystemRoot%\INF\setupapi.dev.log`, displaying at most 100 retained sections. This can provide evidence predating this app's baseline, but is not a complete historical driver database. Windows may rotate or restrict it. Local log timestamps are shown as recorded, without inventing a timezone. Section completion status and actual instance identifiers are parsed; missing versions or completion details are not reconstructed. This log is separate from manufacturer release notes and scan comparisons.

## Diagnostic exports

**Export hardware & driver report** saves the full scan inventory, retained history, latest-version checks, update offers and loaded installation-log entries, including underlying records hidden from the simplified UI. Raw instance/hardware IDs are omitted by default; the opt-in checkbox can expose device serial identifiers. Model names, hashed record IDs, timestamps and versions remain in the default export. No report is uploaded by the app. Review an export before sharing.

Underlying inventory is limited to 3,000 records. Oversized/partial scans cannot replace the last complete history baseline. Windows driver dates are release dates, not installation dates; signature fields are Windows reports rather than independent cryptographic verification.

## Validation and limits

Portable tests cover case-insensitive inventory joins, true provider vs. hardware manufacturer, multiple GPUs, unknown vendors, persisted/reopened history, BIOS changes, partial failures, damaged files, monitoring pauses, bounded installation-log parsing, update failures/cancellation and external-link validation. Browser tests exercise hardware categories, installed/latest comparisons, chipset drivers, vendor changes, update descriptions, failure states, history controls, exports and narrow layouts using explicitly labeled fixtures.

Windows CI separately validates real CIM queries, baseline persistence and a second scan, reads the retained SetupAPI log, and attempts the real read-only Windows Update query. Policy/network/service failures are recorded as unavailable rather than successful availability evidence; unexpected query failures fail validation. The installed application is exercised through its real preload/IPC bridge and upgrade tests retain driver-history data. A separate read-only Windows provider check exercises real NVIDIA desktop/Game Ready and laptop/Studio metadata using explicit model fixtures. MSI requests were rejected and are not claimed as validated. A hosted runner does not establish compatibility with every physical device.

## Public API references

- [Win32_PnPEntity](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-pnpentity) — hardware IDs, device classes, presence and problem codes.
- [Win32_PnPSignedDriver](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/legacy/aa394354(v=vs.85)) — installed provider/version/INF/signature metadata.
- [IUpdateSearcher::Search](https://learn.microsoft.com/en-us/windows/win32/api/wuapi/nf-wuapi-iupdatesearcher-search) — `IsInstalled=0 and IsHidden=0 and Type='Driver'`.
- [IWindowsDriverUpdate](https://learn.microsoft.com/en-us/windows/win32/api/wuapi/nn-wuapi-iwindowsdriverupdate) — driver-specific update metadata, alongside common IUpdate properties.
- [SetupAPI device installation log entries](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/setupapi-device-installation-log-entries) and [section-header format](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/format-of-a-text-log-section-header).

- NVIDIA public website catalog: `https://www.nvidia.com/Download/API/lookupValueSearch.aspx` (product/series/OS), and its `DriverManualLookup` metadata service at `gfwsl.geforce.com`. These are current website contracts, not a promised stable SDK. No third-party driver catalog is used.
