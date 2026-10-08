# Tweakerzzz

A Windows gaming and content-creation workspace built with React, TypeScript, Vite, and Electron. Start with a hardware scan, review a plan, apply supported settings with a local backup, and compare your actual results.

**Status: v0.4.0 development build.** Browser workflows and Windows inventory, tweak detection, recommendations, OBS protocol, repeated-run analysis, and registry apply/restore are covered by automated checks. Tagged installers must also pass packaged-file, install, launch, shortcut, and uninstall checks before release. Monitor switching, vendor-specific devices, and actual performance results still need hardware testing. Direct NVIDIA vibrance control and automatic per-device vendor tuning are not implemented; those settings currently use previews or guides.

The included reference configuration comes from the supplied screenshot: **Ryzen 9 5900X, GeForce RTX 4060 8 GB, 32 GB RAM at 3200 MHz, and Windows 11 Pro**. Reference values are labeled and are replaced by a scan or imported report; they are not measurements of the computer running the browser.

## Implemented capabilities

| Feature | Behavior |
| --- | --- |
| Optimization library | **87 settings: 22 automatic and 65 guided**, across Gaming, Windows, Streaming, Network, Peripherals, and Privacy. Search, filter, review tradeoffs, and build a plan. |
| Windows hardware scan | Reads CPU/RAM directly through Node APIs, then supplements inventory through fixed, read-only CIM/PnP commands with a WMI fallback. PC and peripheral scans are separate; a failed optional provider produces a warning and unknown values instead of failing the complete report. NVIDIA VRAM uses `nvidia-smi` when available; otherwise it remains unknown. Scan reports can be exported and imported. |
| Current Windows settings | Checks all 22 supported automatic tweaks at startup and after apply/restore. **Already configured** means stored values match; **Different settings**, **Not configured**, and **Unable to read** remain distinct. Missing preferences do not imply a particular Windows default. Guided settings remain manual. |
| Automatic changes | Applies an allowlist of per-user registry preferences and, if selected and available, the existing High performance power scheme. Original state is recorded before writing. Settings already matching the requested values are skipped; an entirely redundant plan creates no backup. |
| Display modes | Lists driver-advertised modes for the **primary display**. Tests resolution and refresh changes temporarily, with a **15-second confirmation deadline** and rollback when unconfirmed. Custom timings and NVIDIA scaling controls are not implemented. |
| Display studio | Provides visual color previews and locally saved reference profiles. Actual Digital Vibrance and GPU scaling use the NVIDIA Control Panel guides; there is no integrated NVIDIA color-control API. |
| Peripherals | Reads product descriptions, USB IDs, and up to four parent levels, groups matching interfaces, and includes cameras. Known G102/G203 USB IDs have a local fallback; shared IDs stay labeled as a family. Device cards choose G102/G203, EP-84, Corsair VOID, or category guides from the reported evidence. DPI, polling rates, actuation, camera modes, and firmware remain manual and are not measured by the scanner. |
| Streaming lab | Provides editable starting recommendations and a downloadable OBS settings guide. The guide is entered manually in OBS; it is not an importable OBS profile. |
| Game recommendations | Exact executable profiles for Fortnite, VALORANT, CS2, Apex, Call of Duty/Warzone, Marvel Rivals, and Cyberpunk, with a generic fallback. Uses live CPU/GPU/RAM/driver/settings scans and Gaming/Streaming/Recording workload. Suggestions explain applicability and tradeoffs; configured automatic tweaks are skipped. |
| Repeated benchmark evidence | Named, controlled experiments compare at least three independent Before/After pairs with matching hardware, driver, conditions, duration, and collector settings. Exact tweak-value fingerprints at both ends detect changes during a run. Findings flag consistent improvements/regressions or insufficient evidence and keep multi-tweak changes grouped. |
| Extra measurements | Optional overall CPU/RAM use, NVIDIA GPU utilization/temperature where supported, CPU package temperature from an already-running Libre Hardware Monitor WMI provider, and local read-only OBS v5 WebSocket lag counters. Unavailable sensors stay unavailable. |
| Bubblegum interface | Hot pink and thunder yellow on plum surfaces, rounded panels and buttons, large readable controls, matching desktop/tray icon. |
| FPS recorder | Bundled, checksum-verified PresentMon 2.3.0 records a selected executable while the window is in the tray. Local CSVs, average FPS, 1% lows, P95 frame times, tweak-state snapshots, and matched before/after comparisons. Windows tracing permissions may require launching as administrator under the same account. |
| Restore center | Save a snapshot before changing anything, turn off supported tweaks configured by any tool, or remove their registry overrides to use Windows-managed defaults. Every change is backed up. Open Windows System Protection to create an OS restore point. |
| Browser workspace | Supports browsing, planning, local profiles, report import/export, color previews, and OBS guidance. Hardware scans, FPS recording, Windows changes, backups, and display switching require the Windows desktop app. |

Settings have different purposes: some reduce overhead, some improve frame pacing or capture quality, and some are privacy or desktop preferences. **No FPS increase is guaranteed.** The app does not disable Windows security tools, updates, or system services, and does not apply timer, HPET, voltage, or overclocking modifications.

## Installer for Windows testers

Download [Tweakerzzz Setup 0.4.0 for Windows x64](https://github.com/marajdesigns215-dot/tweakerzzz/releases/download/v0.4.0/Tweakerzzz-Setup-0.4.0-x64.exe) from the [tester release](https://github.com/marajdesigns215-dot/tweakerzzz/releases/tag/v0.4.0). Close any older Tweakerzzz window and double-click the installer. It installs for the current Windows account and creates desktop and Start menu shortcuts. Testers do **not** need Node.js, npm, a source checkout, or PowerShell launch commands.

This is an **unsigned tester build**, so Windows may display an unknown-publisher or SmartScreen notice. Organization-managed policies may require a signed distribution. Uninstall in Windows Settings → Apps; profiles and restore backups are preserved. Read [tester release notes](docs/TESTER_RELEASE.md) for scanning and reporting instructions.

The installer bundles Electron, the application, the tweak manifest, native Windows helpers, and the pinned official PresentMon collector with its license. Release builds verify the packaged files and test installation, desktop launch, shortcuts, and uninstall on an isolated Windows runner before publishing. A SHA-256 checksum accompanies the download. Installer checks do not validate every physical device or demonstrate a performance gain.

## Run the Windows desktop app from source

Use **Windows 11 x64**, built-in **Windows PowerShell 5.1**, and **Node.js 24 LTS** with npm. Node 24 is recommended because tests import TypeScript using Node’s built-in type stripping. Use your existing checkout; no separate Git worktree is required.

From the repository directory:

```powershell
npm.cmd ci
npm.cmd run prepare:collector
npm.cmd run build
npm.cmd run desktop
```

For desktop development with Vite hot reload:

```powershell
npm.cmd run desktop:dev
```

Run one development server at a time on port 5173. The desktop bridge accepts only the app’s own main-frame origin; an unrelated page cannot invoke native operations.

To produce a Windows installer:

```powershell
npm.cmd run dist:win -- --publish never
```

The NSIS installer is written to `release/`. This project currently produces an **unsigned development build** unless a maintainer separately configures signing. Building does not publish a release. Review and test the build before distributing it.

Hardware scans, peripheral scans, and tweak detection use built-in read-only Windows queries and do not execute downloaded `.ps1` files. Registry apply/restore and display scripts launch with process-scoped `RemoteSigned`, not `Bypass`; no permanent machine execution-policy change is made. Downloaded unsigned scripts or organizational execution policies can prevent native features from running. Keep applicable trust and organization policies in place and use an approved, trusted checkout or signed distribution. Ordinary supported operations target the current user and do not automatically request elevation.

## Run the browser preview or cloud workspace

On Linux, the browser workflow does not need an Electron binary:

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. `ELECTRON_SKIP_BINARY_DOWNLOAD` only skips the unused Electron binary download for this browser-only setup; package integrity checking remains enabled. Do **not** use that option when installing dependencies to run or package the Windows desktop app. The Vite browser server binds to `0.0.0.0` for cloud preview access.

Other useful commands:

```bash
npm run build
npm run preview
npm test
```

## Apply and restore a plan

1. Open the Windows desktop app and select **Scan my PC**. Check the detected hardware before choosing settings.
2. Choose automatic changes in **Optimizations**, then **Review plan**. Read each change’s description and save active work.
3. Select **Back up & apply**. Sign out and back in, or restart when appropriate, for settings that Windows does not reload immediately.
4. Use **Restore center** to restore original values. Restore the **most recent backup first** so overlapping changes unwind in order.

Registry and power-plan backups are JSON files in the Electron user-data directory’s `backups` folder (`app.getPath('userData')/backups`, normally under `%APPDATA%`). Keep this folder if reinstalling or moving the app. Backups capture original value types and whether a value existed, and retain the previous power scheme when changed. An application failure attempts rollback; if rollback cannot finish, the app reports that the backup needs attention. A timeout or interrupted process may require checking Restore center before retrying.

Restoring a backup can replace manual changes made to the same settings afterwards. Guided BIOS, driver, game, OBS, and peripheral changes are outside this backup history; save those tools’ own profiles before editing them. Browser selections, reviewed guides, and color profiles use local storage and do not certify the current state of Windows settings.

Display tests are separate from optimization backups. If a tested mode is unreadable, wait for the 15-second timer. An independent Windows helper owns the deadline and original display mode. It restores an unconfirmed change when its input closes, including an Electron exit or crash. Killing the helper itself or losing power can prevent rollback; temporary unconfirmed modes are not saved across sign-out. The app reports a driver rejection if restoration fails rather than claiming success.

## Background FPS recording

1. Launch your game, then open **FPS recorder**. Choose **Find running programs** or enter the game executable (for example, `game.exe`), not a path or launcher.
2. Choose **Before tweaks**, Gaming/Streaming/Recording, a time limit, and a scene label that includes your resolution, graphics, and FPS cap. Start OBS separately for streaming/recording tests.
3. Start recording and return to the game. **Minimize to tray** or close the window to keep recording. The tray menu can reopen the app, stop recording, or quit. The app does not automatically start at login.
4. Stop and save, apply a small set of tweaks, sign out/restart if required, then use **Use for After run** to repeat the same workload. Native preference/display changes are blocked during a recording.
5. Select the matching runs under **Before & after**. CSV exports contain raw PresentMon frame data; summary exports include measurements and the saved tweak states. Repeat runs before attributing differences to a tweak.

Windows ETW tracing may require **Run as administrator** under the same Windows account. The app does not change group membership, security policy, or inject into games. A protected game or unsupported API may produce no frames; such runs are marked unsuccessful, not given invented FPS. Game-specific compatibility still requires tester validation.

Measurements use PresentMon `FrameTime`, representing application presentation cadence, not displayed/generated FPS or OBS rendering/encoding lag. Average FPS is `1000 / mean(FrameTime)`; 1% low FPS is `1000 / mean(slowest ceil(N/100) frame times)` with at least 100 samples. P95 uses the nearest-rank 95th percentile. The most sampled process/swap chain is selected; other streams and invalid/zero intervals are disclosed. Loading screens and pauses count, so select a repeatable gameplay segment.

Records and CSVs are stored in `app.getPath('userData')/recordings`. Each run is limited to 60 minutes, 64 MiB of CSV, or two million valid frame samples. Up to 100 runs are retained without automatic deletion; export and delete runs in the app. Logs remain on the PC and survive uninstall. An app crash may leave a timed trace running temporarily; the next visit to FPS recorder attempts cleanup of only this app's interrupted trace IDs and excludes those runs from comparison.

The collector is [Intel PresentMon 2.3.0](https://github.com/GameTechDev/PresentMon/releases/tag/v2.3.0), distributed under the [included MIT license](vendor/presentmon/LICENSE.txt). `npm run prepare:collector` downloads the official executable and verifies the pinned SHA-256 in `electron/presentmon.json`; the installer and runtime verify it again. No arbitrary collector path or runtime download is exposed to the renderer.

## Game recommendations and repeated experiments

In **FPS recorder**, select a known game or its actual executable, choose Gaming/Streaming/Recording, and select **Scan for recommendations**. Only live detected specs are used as the current PC; imported reports and the reference Ryzen/RTX configuration do not stand in for a scan. Each card explains why it applies and its tradeoff. **Review this tweak** opens the existing plan/backup flow; vendor and in-game settings remain guided. The app never automatically applies or rolls back recommendations. Generic programs receive general guidance rather than a guessed game profile.

Turn on **Use controlled benchmark conditions** to name an experiment and record the game resolution, graphics/upscaling/frame-generation settings, FPS cap, and game build. Confirm you warmed up the scene and kept other settings/workloads consistent. **Use for After run** copies conditions but requires confirming them again. Record at least 60 seconds of usable gameplay per run, with three separate runs before and three after the same change. A baseline is never reused in more than one pair.

A recommendation from repeated tests requires matching executable, scene, workload, duration, collector/telemetry mode, hardware/Windows/graphics-driver signature, and confirmed benchmark conditions. Complete exact fingerprints of all 22 supported settings are compared at the start and end; unknown values or mid-run changes exclude a run. Old recordings without these snapshots remain available for ordinary comparison but cannot support this analysis. Game/OBS/driver-option values entered by the user are not independently inspected. A multi-tweak change is reported as a group, not attributed to one member.

Three consistent pairs can flag improvements when average FPS or 1% lows improve by a median of at least 3%, without any pair worsening average/lows by more than 2% or P95 frame time by more than 2%. Consistent average regressions of 3%, low-FPS regressions of 5%, or P95 regressions of 5% are flagged for review. Average-FPS variation above 10% or low-FPS variation above 15% makes results inconclusive. These are conservative screening rules, not statistical significance or proof of causation. Untracked background work, heat, shader caches, and game content still matter.

Streaming/recording findings additionally require connected OBS measurements with the matching output active throughout. If OBS lag or stream drops worsen by over one percentage point in any pair, the app reports a tradeoff rather than recommending the configuration as a clear win. Select a completed matching run under **Add measured signals** for CPU/GPU load and OBS-lag guidance; its hardware/driver snapshot must match the current live scan.

## CPU/GPU temperatures and OBS measurements

Enable **Record extra measurements** before a capture. These are optional because sampling adds overhead; use the same setting in both configurations. Overall CPU and system RAM are sampled every five seconds. A matching NVIDIA `nvidia-smi` provider supplies whole-device utilization and GPU temperature. These totals include other apps and do not prove which component limits a game. AMD/Intel GPU counters are currently unavailable through this collector.

CPU package temperature is read only from an existing [Libre Hardware Monitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) WMI provider (`root\LibreHardwareMonitor`) with a recognized CPU Package / Tctl/Tdie sensor. Run that tool with its required permissions before capturing if you want this optional reading. Tweakerzzz installs no sensor driver, does not substitute ACPI thermal zones, and labels missing readings unavailable. Sensor availability depends on hardware and provider support; a reported temperature alone does not establish thermal throttling.

For OBS, open **Tools → WebSocket Server Settings**, enable the built-in v5 server, and enter its port/password in the app’s OBS connection panel. Only `127.0.0.1` is supported. Passwords are used in memory and never saved to profiles, recording files, exports, or logs; reconnect after app restart. The client has a fixed read-only request list: `GetStats`, `GetStreamStatus`, and `GetRecordStatus`. It cannot start streams, stop recordings, or modify scenes/encoders.

Start the intended stream/recording before the FPS run. Rendering lag, encoding lag, and stream drops are calculated from OBS counter deltas during collection. Counter resets, changed output activity, or disconnects make percentages unavailable. CPU package temperature is a peak, GPU temperature is a peak, CPU/GPU load is an average, and system RAM pressure is a peak. Missing data is never displayed as zero. Recordings and reports remain local until exported.

## Existing tweaks, defaults, and restore points

**Restore center → Save settings snapshot** records all 22 supported preferences without modifying Windows, including settings created by another app. Select individual tweaks or **Select configured**, then review **turning off tweaks** or **Windows defaults**. The confirmation lists the effect of each action, and a backup preserves exact previous values/types before writing. Turning off privacy/debloat tweaks can re-enable suggestions or background behavior; review that list.

**Windows defaults** removes only selected supported registry overrides and selects an existing Balanced plan if requested. It does not reconstruct an OEM factory image, remove installed software, reset BIOS/drivers, or guarantee a particular effective value. Organization policy and Windows version can still determine behavior. Use a saved backup for exact previous values. Custom power schemes are retained.

**Open System Protection** launches Windows' restore-point dialog. Select the system drive, enable protection through Configure if necessary, then choose Create. Windows handles privileges and creation; the app does not claim a restore point exists without confirmation from Windows. An app settings snapshot and a Windows restore point have different coverage; neither backs up personal files.

## Validate performance and native behavior

Use the same game scene, graphics settings, and capture workload before and after each small set of changes. Compare average FPS, 1% lows, frame-time consistency, temperatures, and OBS rendering/encoding lag. A Ryzen Balanced power setup may outperform or match High performance while using less power. An RTX 4060 benefits most from changes that address the actual GPU, VRAM, or capture bottleneck.

`npm test` checks hardware-report validation, catalog/native allowlist agreement, request validation, IPC origin isolation, and display-confirmation/rollback orchestration with mocked native processes. `npm run build` checks TypeScript and produces the renderer bundle. These checks do not demonstrate actual registry, driver, or hardware behavior.

Development runs in a Linux cloud workspace; native checks run separately on isolated Windows GitHub Actions runners. Those runners verify inventory queries, setting detection, registry backup/restore including external preferences and defaults, real Direct3D presentation capture using a software WARP renderer, and the installer lifecycle. The synthetic rendering test validates collection, not gaming performance. This does not establish compatibility with every peripheral or display, or demonstrate an FPS gain.

GitHub Actions is configured to build and test on `windows-latest` with Node 24, parse native scripts with Windows PowerShell 5.1, verify read-only hardware and tweak queries, and run a real registry integration test on the isolated runner. That test temporarily writes transparency and menu delay, verifies the backup, and restores original values. Pushes to main build and retain an unsigned installer artifact after validation. Version tags publish the verified installer and checksum as a GitHub prerelease. The installer is also available through a manually dispatched build.

## Source map

- `src/App.tsx` — workspace, plans, hardware reports, display previews, and OBS guidance.
- `src/data/tweaks.ts` — descriptions, applicability, tradeoffs, and guided steps.
- `electron/` — isolated preload bridge, request validation, and native-process coordination.
- `scripts/windows/` — shared tweak manifest, registry transactions, settings links, and supported display-mode operations.
- `electron/scanner.cjs` and `electron/tweak-status.cjs` — resilient read-only Windows inventory and current-setting detection.
- `tests/` — report validation and mocked native-boundary tests.

The browser workflow can also be exercised with `python tests/ui_smoke.py` when Python Playwright and Chromium are installed. This checks exports, report validation, saved profiles, mobile layout, and mocked desktop integration. Set `TWEAKER_URL` to test a production preview. On a Windows **test account**, `powershell -NoProfile -File tests/windows.integration.ps1 -AllowLocalSettingChanges` exercises real registry backup/restore; it does not test monitor switching; `node tests/windows.capture.cjs` separately verifies real ETW FPS collection with a CI renderer.

## Updating older versions and scan errors

Close every Tweakerzzz window, download the latest GitHub ZIP, and extract it to a new folder. Open a terminal there and run `npm.cmd ci`, `npm.cmd run build`, then `npm.cmd run desktop`. Confirm the header says **v0.4.0**. This release uses larger text, brighter descriptions, and larger buttons/switches across all screens.

The original error “scan.ps1 is not digitally signed” came from Windows marking a downloaded ZIP's scripts as Internet files. v0.2.0 scans and read-only tweak checks do not depend on that script. No PowerShell execution policy needs to change for these reads. **Apply/restore and display changes still use the native script trust policy.** If you trust the ZIP downloaded from your repository, use its **Properties → Unblock → Apply**, then extract it again to a new folder; do not disable organizational policy. An organization that requires signed software may need an approved signed build.

PC scanner and Peripherals keep full errors on screen with **Download error details**. Optional inventory failures produce component warnings and explicit unknown values. **Check Windows settings** refreshes the 22 readable tweak states. This reads saved registry values and the active power plan, not whether each Windows component has already reloaded a value or whether a machine policy overrides it.

Read-only Windows CI now runs `node tests/windows.read.cjs`; registry integration additionally checks live status and that repeated applications skip existing settings. The cloud machine still cannot execute those Windows operations locally.

## v0.2.1 peripheral testing

This update is intended to work across testers’ devices. It does not assign the developer’s mouse, keyboard, or webcam model to another PC. Windows can expose only a generic name or a receiver; a USB vendor ID alone never proves the attached model. EP-84 detection requires a product name exposed by the device or its driver. OEM keyboard USB IDs are not assumed to belong to Epomaker.

1. Close older app windows and download/extract the latest source into a new folder. Run `npm.cmd ci`, `npm.cmd run build`, and `npm.cmd run desktop`; verify **v0.2.1**.
2. Open **Peripherals → Scan devices**. Check product names, device types, and connections. **Product name reported**, **Recognized USB product ID**, and **Brand identified · model unavailable** indicate different evidence.
3. Click a device to view its recommendations. Known G102/G203 IDs, an EP-84 name, and a Corsair VOID name select matching guides. Cameras and other models receive category guidance. These suggestions do not automatically change peripheral settings or guarantee FPS gains.
4. Use **Show generic Windows entries** to see unresolved devices. Generic entries remain in exports even when hidden. The **Export device report** button saves names, types, connection labels, non-unique VID:PID product IDs, and identification results, without device instance IDs, serials, or container GUIDs. **Export device settings guide** saves the selected recommendations.
5. When reporting a mismatch, include the device’s actual model, USB/receiver/Bluetooth connection, and the exported report. Check a cable connection when a receiver hides a keyboard model. Do not flash firmware from a guessed model.

The local Logitech fallback covers `046D:C084` (G203), `046D:C092` (shared G102/G203 LIGHTSYNC), and `046D:C09D` (G102 LIGHTSYNC), using the [USB ID Repository](https://github.com/usbids/usbids/blob/master/usb.ids). Other models use device-supplied names or category guidance. Duplicate interfaces are grouped only when both product name and physical ancestry/container match; identical products on different devices remain separate. Shared receivers can still prevent exact physical-device counts.

Portable tests cover parent descriptors, generic receivers, unknown OEM IDs, headset grouping, separate identical devices, cameras, report privacy, and per-device guide selection. Windows runner checks exercise live inventory collection; recognition of individual physical devices and vendor-specific behavior still need tester verification.

Run `python tests/ui_recommendations.py` with the development server for mocked-native recommendation/telemetry/OBS setup flows and responsive bubblegum UI checks. Actual GPU/CPU sensor hardware and real OBS installations still need tester validation; the WebSocket protocol test uses a local OBS-compatible fixture.
