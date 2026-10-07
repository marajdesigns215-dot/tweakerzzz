# Tweakerzzz

A Windows gaming and content-creation workspace built with React, TypeScript, Vite, and Electron. Start with a hardware scan, review a plan, apply supported settings with a local backup, and compare your actual results.

**Status: development build, not a completed or Windows-validated optimizer.** The browser workflow and mocked native integration have been tested. Actual Windows scanning, registry changes, display switching, and installer execution remain unverified. Direct NVIDIA vibrance control and automatic per-device vendor tuning are not implemented; those settings currently use previews or guides.

The included reference configuration comes from the supplied screenshot: **Ryzen 9 5900X, GeForce RTX 4060 8 GB, 32 GB RAM at 3200 MHz, and Windows 11 Pro**. Reference values are labeled and are replaced by a scan or imported report; they are not measurements of the computer running the browser.

## Implemented capabilities

| Feature | Behavior |
| --- | --- |
| Optimization library | **87 settings: 22 automatic and 65 guided**, across Gaming, Windows, Streaming, Network, Peripherals, and Privacy. Search, filter, review tradeoffs, and build a plan. |
| Windows hardware scan | Reads CPU, GPU, RAM, Windows version, local storage, and supported peripheral inventory through Windows CIM. NVIDIA VRAM uses `nvidia-smi` when available; otherwise it remains unknown. Scan reports can be exported and imported. |
| Automatic changes | Applies an allowlist of per-user registry preferences and, if selected and available, the existing High performance power scheme. Original state is recorded before writing. |
| Display modes | Lists driver-advertised modes for the **primary display**. Tests resolution and refresh changes temporarily, with a **15-second confirmation deadline** and rollback when unconfirmed. Custom timings and NVIDIA scaling controls are not implemented. |
| Display studio | Provides visual color previews and locally saved reference profiles. Actual Digital Vibrance and GPU scaling use the NVIDIA Control Panel guides; there is no integrated NVIDIA color-control API. |
| Peripherals | Shows device information exposed by Windows and relevant setup guides. Vendor-only settings, polling rates, DPI, actuation, and firmware are adjusted in the appropriate vendor tools. |
| Streaming lab | Provides editable starting recommendations and a downloadable OBS settings guide. The guide is entered manually in OBS; it is not an importable OBS profile. |
| Browser workspace | Supports browsing, planning, local profiles, report import/export, color previews, and OBS guidance. Hardware scans, Windows changes, backups, and display switching require the Windows desktop app. |

Settings have different purposes: some reduce overhead, some improve frame pacing or capture quality, and some are privacy or desktop preferences. **No FPS increase is guaranteed.** The app does not disable Windows security tools, updates, or system services, and does not apply timer, HPET, voltage, or overclocking modifications.

## Run the Windows desktop app

Use **Windows 11 x64**, built-in **Windows PowerShell 5.1**, and **Node.js 24 LTS** with npm. Node 24 is recommended because tests import TypeScript using Node’s built-in type stripping. Use your existing checkout; no separate Git worktree is required.

From the repository directory:

```powershell
npm ci
npm run build
npm run desktop
```

For desktop development with Vite hot reload:

```powershell
npm run desktop:dev
```

Run one development server at a time on port 5173. The desktop bridge accepts only the app’s own main-frame origin; an unrelated page cannot invoke native operations.

To produce a Windows installer:

```powershell
npm run dist:win -- --publish never
```

The NSIS installer is written to `release/`. This project currently produces an **unsigned development build** unless a maintainer separately configures signing. Building does not publish a release. Review and test the build before distributing it.

Native scripts launch with process-scoped `RemoteSigned`, not `Bypass`; no permanent machine execution-policy change is made. Downloaded unsigned scripts or organizational execution policies can prevent native features from running. Keep applicable trust and organization policies in place and use an approved, trusted checkout or signed distribution. Ordinary supported operations target the current user and do not automatically request elevation.

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

GitHub Actions runs the build and tests on `windows-latest` with Node 24 parses every native script using Windows PowerShell 5.1, and runs a real registry integration test on the isolated runner. That test temporarily writes transparency and menu delay, verifies the backup, and restores original values. The workflow has not been run from this cloud workspace. A manually dispatched workflow can additionally build and retain an unsigned Windows installer as a temporary development artifact; it never publishes a release.

## Source map

- `src/App.tsx` — workspace, plans, hardware reports, display previews, and OBS guidance.
- `src/data/tweaks.ts` — descriptions, applicability, tradeoffs, and guided steps.
- `electron/` — isolated preload bridge, request validation, and native-process coordination.
- `scripts/windows/` — hardware inventory, registry transactions, settings links, and supported display-mode operations.
- `tests/` — report validation and mocked native-boundary tests.

The browser workflow can also be exercised with `python tests/ui_smoke.py` when Python Playwright and Chromium are installed. This checks exports, report validation, saved profiles, mobile layout, and mocked desktop integration. Set `TWEAKER_URL` to test a production preview. On a Windows **test account**, `powershell -NoProfile -File tests/windows.integration.ps1 -AllowLocalSettingChanges` exercises real registry backup/restore; it does not test monitor switching or FPS.
