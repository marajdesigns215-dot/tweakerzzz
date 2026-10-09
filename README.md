# Tweakerzzz

A Windows gaming and content-creation workspace built with React, TypeScript, Vite, and Electron. Start with a hardware scan, review a plan, apply supported settings with a local backup, and compare your actual results.

**Status: v0.6.4 beta build.** Browser workflows and Windows inventory, tweak detection, recommendations, OBS protocol, repeated-run analysis, and registry apply/restore are covered by automated checks. Tagged installers must also pass packaged-file, install, launch, shortcut, and uninstall checks before release. Monitor switching, vendor-specific devices, and actual performance results still need hardware testing. NVIDIA digital vibrance profiles use a native foreground observer with exact-level recovery. Physical NVIDIA color writes still need tester hardware validation; brightness/contrast/warmth and vendor-specific device tuning remain previews or guides.

No reference PC is preloaded. Every hardware-dependent screen uses the latest native scan or an explicitly labeled imported report. NVIDIA, AMD, Intel, and unrecognized hardware get appropriate vendor guidance or an unknown result. Encoder hints are conservative model-family rules, not a probe of installed encoder support; check availability in your capture software. Missing memory speed and VRAM stay unknown. The Windows desktop build targets Windows x64; support for every device, driver, sensor, or control API is not implied.

## Implemented capabilities

| Feature | Behavior |
| --- | --- |
| Optimization library | **89 catalog entries: 22 automatic and 67 guided; hardware-specific entries appear only when applicable**, across Gaming, Windows, Streaming, Network, Peripherals, and Privacy. Search, filter, review tradeoffs, and build a plan. |
| Windows hardware scan | Reads CPU/RAM directly through Node APIs, then supplements inventory through fixed, read-only CIM/PnP commands with a WMI fallback. PC and peripheral scans are separate; a failed optional provider produces a warning and unknown values instead of failing the complete report. NVIDIA VRAM uses `nvidia-smi` when available; otherwise it remains unknown. Scan reports can be exported and imported. |
| Current Windows settings | Checks all 22 supported automatic tweaks at startup and after apply/restore. **Already configured** means stored values match; **Different settings**, **Not configured**, and **Unable to read** remain distinct. Missing preferences do not imply a particular Windows default. Guided settings remain manual. |
| Automatic changes | Applies an allowlist of per-user registry preferences and, if selected and available, the existing High performance power scheme. Original state is recorded before writing. Settings already matching the requested values are skipped; an entirely redundant plan creates no backup. |
| Program colors | NVIDIA digital vibrance per foreground executable on one selected SDR display. Desktop fallback, tray observer, exact original-level recovery. No game injection or automatic login startup. |
| Drivers & devices | Fresh motherboard/system/BIOS/component/peripheral scan, installed driver versions, and matched official support directories. Unknown models stay unresolved; no automatic installations or BIOS flashes. |
| Display modes | Lists driver-advertised modes for the **primary display**. Tests resolution and refresh changes temporarily, with a **15-second confirmation deadline** and rollback when unconfirmed. Custom timings and NVIDIA scaling controls are not implemented. |
| Display studio | Per-program NVIDIA digital vibrance uses a native foreground observer on a supported NVIDIA output. Manual color, scaling, adaptive-sync, and range guides follow the detected NVIDIA/AMD/Intel vendor. Other color sliders remain previews. |
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

Download [Tweakerzzz Setup 0.6.4 for Windows x64](https://github.com/marajdesigns215-dot/tweakerzzz/releases/download/v0.6.4/Tweakerzzz-Setup-0.6.4-x64.exe) from the [tester release](https://github.com/marajdesigns215-dot/tweakerzzz/releases/tag/v0.6.4). Close any older Tweakerzzz window and double-click the installer. It installs for the current Windows account and creates desktop and Start menu shortcuts. Testers do **not** need Node.js, npm, a source checkout, or PowerShell launch commands.

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

Hardware scans, peripheral scans, snapshots, and tweak detection use built-in read-only Windows queries and do not execute downloaded `.ps1` files. Registry apply/restore and display scripts launch with process-scoped `RemoteSigned`, not `Bypass`; no permanent machine execution-policy change is made. Downloaded unsigned scripts or organizational execution policies can prevent native features from running. Keep applicable trust and organization policies in place and use an approved, trusted checkout or signed distribution. Ordinary supported operations target the current user and do not automatically request elevation.

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

## Recommended workflow

The sidebar and Overview guide follow this order. Overview and PC scanner are adjacent entry points for the first step; all pages remain directly accessible.

1. **Overview / PC scanner:** scan your PC and check the detected hardware.
2. **Drivers & devices:** review official software for your hardware. Finish any driver changes before recording a baseline.
3. **FPS recorder:** record a repeatable scene as a Before run.
4. **Restore center:** save your current settings snapshot. Use the System Protection shortcut if you also want a Windows restore point.
5. **Optimizations:** review applicable changes, their tradeoffs, and the backup before applying a plan.
6. **Peripherals:** review detected devices and their settings guides.
7. **Streaming lab:** configure your streaming or recording workload if needed.

Return to **FPS recorder** for an After run in the same scene. Test one change at a time when identifying what helps. Keep drivers, graphics settings, and the streaming/recording workload consistent when comparing Windows tweaks; use a separate experiment for changes to those conditions. Display studio follows Streaming lab, with How it works and Updates below the main navigation.

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
2. Choose **Before tweaks**, Gaming/Streaming/Recording, a time limit, and a scene label that includes your resolution, graphics, and FPS cap. Start your streaming/recording software separately if that is your workload; OBS is optional.
3. Start recording and return to the game. **Minimize to tray** or close the window to keep recording. The tray menu can reopen the app, stop recording, or quit. The app does not automatically start at login.
4. Stop and save, apply a small set of tweaks, sign out/restart if required, then use **Use for After run** to repeat the same workload. Native preference/display changes are blocked during a recording.
5. Select the matching runs under **Before & after**. CSV exports contain raw PresentMon frame data; summary exports include measurements and the saved tweak states. Repeat runs before attributing differences to a tweak.

Windows ETW tracing may require **Run as administrator** under the same Windows account. The app does not change group membership, security policy, or inject into games. A protected game or unsupported API may produce no frames; such runs are marked unsuccessful, not given invented FPS. Game-specific compatibility still requires tester validation.

Application FPS now uses intervals between **distinct PresentMon CPUStartTime timestamps** in one process/swap chain. Repeated CSV rows are excluded, fixing inflated FPS in affected captures. Reports include highest/lowest FPS over complete windows of at least one second, average FPS, 1%/0.1% lows, P95/P99 and worst frame time, variability, long-frame counts, and an interactive timeline. The optional **Collect displayed FPS** compatibility test reports **displayed FPS separately** where supported; it is off by default because some environments return no data in that mode. Normal application FPS does not depend on display tracking. Average FPS is `1000 / mean(interval)`; 1% low uses the mean of the slowest 1% of intervals. Loading screens and pauses count. See [measurement definitions, limitations and regression coverage](docs/FPS_MEASUREMENT.md).

On older recordings, use **Recalculate saved CSV** to correct counts and add these statistics. The original CSV and an original-metadata backup are preserved. Display timings and hardware samples missing from that recording cannot be recreated. Older or suspect calculations cannot drive repeated-run recommendations. Use matched Before and After captures with the same collector mode. Older captures recalculated from timestamps remain compatible with matched application-only captures; different collection/calculation modes are not mixed.

Records and CSVs are stored in `app.getPath('userData')/recordings`. Each run is limited to 60 minutes, 64 MiB of CSV, or two million CSV rows. Up to 100 runs are retained without automatic deletion; export and delete runs in the app. Logs remain on the PC and survive uninstall. An app crash may leave a timed trace running temporarily; the next visit to FPS recorder attempts cleanup of only this app's interrupted trace IDs and excludes those runs from comparison.

The collector is [Intel PresentMon 2.3.0](https://github.com/GameTechDev/PresentMon/releases/tag/v2.3.0), distributed under the [included MIT license](vendor/presentmon/LICENSE.txt). `npm run prepare:collector` downloads the official executable and verifies the pinned SHA-256 in `electron/presentmon.json`; the installer and runtime verify it again. No arbitrary collector path or runtime download is exposed to the renderer.

### Running-program selection fix (v0.6.2)

**Find running programs** now opens an in-app list with text search, mouse scrolling, and large clickable rows. **Recognized games** filters the presets the app knows; **All programs** includes other games and applications, with recognized games listed first. Search accepts either the executable or its recognized game title. The selected executable is checked against a fresh Windows process list before capture starts; a missing target produces an actionable error without creating an empty recording. A running process is not proof that it is rendering or that tracing will succeed.

The Marvel Rivals preset now uses `Marvel-Win64-Shipping.exe`. The older `marvelrivals-win64-shipping.exe` hint could point at no running process. In an already-installed v0.6.1 build, launch the game and enter its real executable manually; use **Task Manager → Details** to verify it if necessary. The old game-profile dropdown may then display Other game, which does not prevent FPS recording. Try a short capture first. A zero-frame result alone does not establish an anti-cheat restriction; preserve the CSV, summary and collector notes for diagnosis.

Failed/interrupted recordings now offer **Retry recording**, preserving the original Before/After phase. Only completed recordings offer **Use for After run**. Existing recordings remain readable; newer summaries include when the target process was found. These fixes are included in the v0.6.2 installer. Actual Marvel Rivals capture still requires a live game test; follow the [Windows verification procedure](docs/MARVEL_RIVALS_TEST.md).

`python3 tests/ui_program_picker.py` exercises a 154-process list, title/executable search, recognized-game filtering, mouse/keyboard selection, retry behavior and narrow-screen layout using mocked Windows data. Run with the development server, or set `TWEAKER_URL`. `tests/windows.capture.cjs` also checks rejection of a missing process before its real Windows D3D11 capture test; actual Marvel Rivals capture still needs Windows/game validation.

## Game recommendations and repeated experiments

In **FPS recorder**, select a known game or its actual executable, choose Gaming/Streaming/Recording, and select **Scan for recommendations**. Only live detected specs are used as the current PC; imported reports do not stand in for a live scan. Each card explains why it applies and its tradeoff. **Review this tweak** opens the existing plan/backup flow; vendor and in-game settings remain guided. The app never automatically applies or rolls back recommendations. Generic programs receive general guidance rather than a guessed game profile.

Turn on **Use controlled benchmark conditions** to name an experiment and record the game resolution, graphics/upscaling/frame-generation settings, FPS cap, and game build. Confirm you warmed up the scene and kept other settings/workloads consistent. **Use for After run** copies conditions but requires confirming them again. Record at least 60 seconds of usable gameplay per run, with three separate runs before and three after the same change. A baseline is never reused in more than one pair.

A recommendation from repeated tests requires matching executable, scene, workload, duration, collector/telemetry mode, hardware/Windows/graphics-driver signature, and confirmed benchmark conditions. Complete exact fingerprints of all 22 supported settings are compared at the start and end; unknown values or mid-run changes exclude a run. Old recordings without these snapshots remain available for ordinary comparison but cannot support this analysis. Game/OBS/driver-option values entered by the user are not independently inspected. A multi-tweak change is reported as a group, not attributed to one member.

Three consistent pairs can flag improvements when average FPS or 1% lows improve by a median of at least 3%, without any pair worsening average/lows by more than 2% or P95 frame time by more than 2%. Consistent average regressions of 3%, low-FPS regressions of 5%, or P95 regressions of 5% are flagged for review. Average-FPS variation above 10% or low-FPS variation above 15% makes results inconclusive. These are conservative screening rules, not statistical significance or proof of causation. Untracked background work, heat, shader caches, and game content still matter.

Game FPS is recorded directly from Windows graphics events: OBS is never required, including Streaming and Recording workloads. Repeated-run findings without OBS are labeled FPS only and do not establish stream/recording quality. Optional connected OBS measurements with the matching output active throughout add creation-quality checks. If OBS lag or stream drops worsen by over one percentage point in any pair, the app reports a tradeoff rather than recommending the configuration as a clear win. Select a completed matching run under **Add measured signals** for CPU/GPU load and OBS-lag guidance; its hardware/driver snapshot must match the current live scan.

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

Use the same game scene, graphics settings, and capture workload before and after each small set of changes. Compare average FPS, 1% lows, frame-time consistency, temperatures, and OBS rendering/encoding lag. A Ryzen Balanced power setup may outperform or match High performance while using less power. Choose changes that address the measured CPU, GPU, memory, or capture bottleneck on that machine.

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

Close every Tweakerzzz window, download the latest GitHub ZIP, and extract it to a new folder. Open a terminal there and run `npm.cmd ci`, `npm.cmd run build`, then `npm.cmd run prepare:color` and `npm.cmd run desktop`. Confirm the header says **v0.6.3**. This release uses larger text, brighter descriptions, and larger buttons/switches across all screens.

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


## Per-program display colors (v0.5.1)

Open **Display studio → Automatic program vibrance**. Select the NVIDIA-connected monitor, set desktop vibrance, and add the actual game executable through **Find running programs** or its exact `.exe` name. Choose each game's level, confirm Windows HDR is off and other color observers are stopped, then **Save & start observer**. Profile editing is locked while running; stopping restores the exact level read before the session. Closing the window keeps the observer in the tray. Quitting restores colors. The observer does not start automatically at Windows login.

The native x64 helper loads `nvapi64.dll` only from Windows System32. It probes the NVIDIA DVC Ex interface before offering a display. It polls the foreground process twice per second, writes only when required, verifies driver read-back, and never injects into a game. Only digital vibrance is automated. The older brightness/contrast/warmth color study is still a visual preview. SDR must be confirmed by the user; HDR is not detected automatically. NVIDIA hybrid-laptop outputs, remote displays, AMD, Intel, or unsupported driver interfaces are not controlled.

The original raw level and monitor interface identity are written to a local recovery record before any driver write. Parent input closure asks the independent helper to restore. If the helper is killed, the driver resets, or a monitor disconnects, recovery may require reconnecting the original monitor and selecting **Recover original colors**, or using NVIDIA Control Panel. A different monitor is never deliberately assigned another display's recovery values. Color settings are separate from registry backups. Keep observer state and other background software consistent in before/after FPS experiments.

## Drivers & devices

**Scan drivers & devices** reads the user's actual board manufacturer/product/revision, system model, BIOS version, GPU driver, storage models, component driver versions, and peripherals. Recommendations link to a fixed catalog of official support directories; an exact downloadable package is not inferred from a generic name. OEM system support takes priority for recognized Dell/HP/Lenovo/Acer systems. Motherboard pages are preferred for onboard network/audio and fan utilities. CPU names alone do not establish a chipset. Generic UVC cameras and HID devices can work with the built-in Windows drivers.

The app does not check online version inventories or call a driver out of date. Confirm the exact model, revision, and OS before choosing packages. Standard fans are usually controlled through BIOS and are not individually enumerated; named USB cooling controllers can receive vendor utility suggestions. No automatic downloads, installs, overclocking, BIOS flashes, or firmware updates are performed.

## Snapshot fix for downloaded source ZIPs

**Save settings snapshot** now reads the allowlisted registry values and power scheme through a fixed read-only query, then atomically writes a local backup in the same format as previous releases. It does not execute downloaded `tweaks.ps1`, unblock files, or change PowerShell execution policy. Windows validation adds an Internet-zone marker to that script and checks a full 22-setting snapshot without registry/power changes. Existing apply/restore operations retain their script trust requirements; use the installer asset rather than the source ZIP for testers.

The new color helper is compiled on Windows with `npm run prepare:color` using the built-in .NET Framework compiler. The Windows workflow checks compilation, profile validation/matching, live foreground querying, helper IPC, unsupported-hardware behavior, and packaged helper integrity. It cannot validate actual vibrance changes without a supported physical NVIDIA display; those remain a hardware testing requirement.

## Hardware guidance consistency (v0.5.1)

PC scanner, FPS recorder’s recommendation scan, and Drivers & devices now refresh one shared hardware report. Overview, the optimization catalog and detail dialogs, streaming settings and exports, display guides, and peripheral cards use that report. A failed rescan clears old hardware guidance, and a late response cannot replace a newer scan or import. Fresh sessions start unscanned. Imported reports are labeled and cannot establish live benchmark conditions.

Regression checks cover NVIDIA, AMD, Intel, integrated/ambiguous adapters, different RAM capacities/speeds, all scan entry points, failures, and overlapping requests. Run `python3 tests/ui_hardware_guidance.py` with the Vite server running for the renderer workflow checks. These tests use inventory fixtures; physical compatibility remains dependent on the installed Windows drivers and supported APIs.

## Error recovery and desktop walkthrough (v0.5.2)

The resolution controls use only driver-reported mode pairs in the desktop app. Missing/failed mode queries disable testing and offer a refresh; preview samples remain limited to browser planning mode. Changing resolution preserves the selected refresh rate only if that pair is supported. The aspect-ratio label is calculated from the selected dimensions. Display changes still require confirmation and retain native automatic rollback.

Damaged FPS metadata is excluded from the renderer without deleting its JSON or CSV. Recording history identifies affected files and their folder while valid runs and new recordings remain usable. Restore a valid JSON copy or move the damaged file out of the recordings folder to clear its warning. Ordinary before/after comparisons reject pairs where only one run has hardware or controlled-benchmark information. Legacy pairs without hardware snapshots explicitly disclose that the hardware match is unverified.

`tests/ui_error_recovery.py` exercises production-renderer failure paths and every tab at 390, 900, and 1440 pixels. `tests/windows.app.cjs`, invoked by the isolated installer test, drives the installed Electron app through its real preload/IPC bridge: tab navigation, inventory, process and peripheral lists, drivers, display-mode availability, streaming profiles, and a read-only settings snapshot. It captures renderer errors and retains a screenshot/report in the development artifact. It never applies registry, display-resolution, or color changes; physical display/GPU behavior still needs hardware testing. Remote debugging is enabled only for that CI test process, not installed shortcuts.


## Optional app updates (v0.6.0)

Installed Windows users can open **Updates → Check for updates**, review the available version and notes, and choose **Download**. Downloads show progress and can be cancelled. When ready, choose **Review installation → Install & restart**, or **Later**. Finish Windows changes, stop FPS recording and automatic color profiles, and resolve any pending resolution test before installing. Updates retain the same application identity, installation location, and user-data folders.

There are no startup checks, automatic downloads, or install-on-quit behavior. The tester channel includes GitHub prereleases from this repository and refuses downgrades. `electron-updater` downloads the full NSIS installer over HTTPS and verifies the SHA512 published in `latest.yml`; unsigned builds remain unsigned. Users on 0.5.2 or earlier need one manual installer upgrade to get this feature. Source/browser builds link to releases instead.

The release workflow packages the updater, verifies its feed configuration and installer digest, and publishes `latest.yml` and the installer/blockmap assets together. Keep version tags and `package.json` in agreement and retain those assets for future versions. GitHub connectivity is required only when checking or downloading. Failed checks/downloads leave the installed app in place and offer retry/manual download.

Updater unit and IPC tests cover manual controls, concurrent requests, cancellation, failed checks/checksums, active-operation guards, and cleanup before installation. A local HTTP fixture exercises the actual GitHub provider and NSIS downloader, including corrupt-byte rejection and no downgrades; it never executes fixture installer bytes. `tests/ui_updates.py` covers the rendered flow and browser fallback. Isolated Windows CI upgrades the pinned 0.6.2 installer, checks saved-data retention and the new installed version, and walks through the real Updates IPC without automatically contacting GitHub. Public release checks verify update discovery and checksum-validated downloads; the complete public-feed-to-restart path still requires a tester PC.


## Protected registry keys (v0.6.1)

Existing keys are opened with `RegistryRights.SetValue` for writes/deletes rather than unnecessarily requesting key-creation rights. Apply, disable, and defaults check access before taking a transaction backup or changing preferences. Missing-key checks open the nearest existing parent for creation access without creating keys. These checks cannot predict every driver/security-provider decision, so failures during a write still require complete rollback before a blocked plan can be offered.

When a plan is blocked, the review names the affected tweaks and offers **Remove blocked tweaks**. The user reviews and applies the remaining selection separately; there is no silent partial application. Registry ownership and ACLs are never changed by the app. Restore skips preferences that already equal their exact saved state, avoiding unnecessary writes to untouched protected values during rollback. A rollback failure still requires backup recovery and is never treated as a safely blocked plan.

For protected Edge policies, the notice points to Edge Settings → System and performance. Leave settings alone if they are managed or unavailable. Windows CI runs `tests/windows.permissions.ps1` on private disposable keys, reproducing CreateSubKey denial with permitted value writes, denied value writes, protected parents, and a permission change after preflight with partial-write rollback. Production Edge/Windows key ACLs are not modified by these tests.
