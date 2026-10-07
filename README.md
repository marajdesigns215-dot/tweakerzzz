# Tweakerzzz

A Windows gaming and content-creation workspace built with React, TypeScript, Vite, and Electron. Start with a hardware scan, review a plan, apply supported settings with a local backup, and compare your actual results.

**Status: v0.2.1 development build, not a completed or Windows-validated optimizer.** The browser workflow and mocked native integration have been tested. Actual Windows scanning, registry changes, display switching, and installer execution remain unverified. Direct NVIDIA vibrance control and automatic per-device vendor tuning are not implemented; those settings currently use previews or guides.

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
| Browser workspace | Supports browsing, planning, local profiles, report import/export, color previews, and OBS guidance. Hardware scans, Windows changes, backups, and display switching require the Windows desktop app. |

Settings have different purposes: some reduce overhead, some improve frame pacing or capture quality, and some are privacy or desktop preferences. **No FPS increase is guaranteed.** The app does not disable Windows security tools, updates, or system services, and does not apply timer, HPET, voltage, or overclocking modifications.

## Run the Windows desktop app

Use **Windows 11 x64**, built-in **Windows PowerShell 5.1**, and **Node.js 24 LTS** with npm. Node 24 is recommended because tests import TypeScript using Node’s built-in type stripping. Use your existing checkout; no separate Git worktree is required.

From the repository directory:

```powershell
npm.cmd ci
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

## Validate performance and native behavior

Use the same game scene, graphics settings, and capture workload before and after each small set of changes. Compare average FPS, 1% lows, frame-time consistency, temperatures, and OBS rendering/encoding lag. A Ryzen Balanced power setup may outperform or match High performance while using less power. An RTX 4060 benefits most from changes that address the actual GPU, VRAM, or capture bottleneck.

`npm test` checks hardware-report validation, catalog/native allowlist agreement, request validation, IPC origin isolation, and display-confirmation/rollback orchestration with mocked native processes. `npm run build` checks TypeScript and produces the renderer bundle. These checks do not demonstrate actual registry, driver, or hardware behavior.

The implementation was developed in a Linux cloud workspace. **Live Windows hardware scans, registry apply/restore, monitor switching, and installer execution have not been exercised there.** Validate these on a Windows test account and suitable display before relying on them on a main gaming setup.

GitHub Actions is configured to build and test on `windows-latest` with Node 24, parse native scripts with Windows PowerShell 5.1, verify read-only hardware and tweak queries, and run a real registry integration test on the isolated runner. That test temporarily writes transparency and menu delay, verifies the backup, and restores original values. The Windows workflow result has not been verified from this cloud workspace. A manually dispatched workflow can additionally build and retain an unsigned Windows installer as a temporary development artifact; it never publishes a release.

## Source map

- `src/App.tsx` — workspace, plans, hardware reports, display previews, and OBS guidance.
- `src/data/tweaks.ts` — descriptions, applicability, tradeoffs, and guided steps.
- `electron/` — isolated preload bridge, request validation, and native-process coordination.
- `scripts/windows/` — shared tweak manifest, registry transactions, settings links, and supported display-mode operations.
- `electron/scanner.cjs` and `electron/tweak-status.cjs` — resilient read-only Windows inventory and current-setting detection.
- `tests/` — report validation and mocked native-boundary tests.

The browser workflow can also be exercised with `python tests/ui_smoke.py` when Python Playwright and Chromium are installed. This checks exports, report validation, saved profiles, mobile layout, and mocked desktop integration. Set `TWEAKER_URL` to test a production preview. On a Windows **test account**, `powershell -NoProfile -File tests/windows.integration.ps1 -AllowLocalSettingChanges` exercises real registry backup/restore; it does not test monitor switching or FPS.

## Updating older versions and scan errors

Close every Tweakerzzz window, download the latest GitHub ZIP, and extract it to a new folder. Open a terminal there and run `npm.cmd ci`, `npm.cmd run build`, then `npm.cmd run desktop`. Confirm the header says **v0.2.1**. This release uses larger text, brighter descriptions, and larger buttons/switches across all screens.

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

Portable tests cover parent descriptors, generic receivers, unknown OEM IDs, headset grouping, separate identical devices, cameras, report privacy, and per-device guide selection. Live Windows collection and vendor-specific device behavior still need tester verification.
