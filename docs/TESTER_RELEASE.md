Download **Tweakerzzz-Setup-0.3.0-x64.exe** below. Source-code ZIP files are not the installer.

1. Quit the older Tweakerzzz version, including its tray icon, then double-click the installer.
2. Open Tweakerzzz from the desktop or Start menu. No Node.js, npm, or PowerShell launch commands are needed.
3. Open **FPS recorder**. Launch your game, choose its executable, label the scene and workload, and record a **Before** run. Closing the window keeps recording in the tray. Stop and save, apply tweaks, then repeat the same scene as **After** and select both runs to compare.
4. Open **Restore center** to save a settings snapshot, turn off selected tweaks (including ones enabled outside this app), or review Windows defaults. Every change keeps a backup.
5. Use **Open System Protection** and Windows' **Create…** button to create a Windows restore point. Enable protection through Configure first if needed.

**New in 0.3.0:** real PresentMon FPS logs, tray recording, average FPS/1% lows/P95 frame times, CSV and summary exports, before/after comparison, saved tweak-state snapshots, selective disable/default controls, and Windows restore-point guidance.

Windows may require **Run as administrator** under the same account for FPS tracing. Some protected games/APIs may not expose frames. Unsuccessful runs show an error; no FPS results are fabricated. Comparisons measure differences and do not prove tweaks caused them. The synthetic Windows test validates Direct3D frame collection, not real-game compatibility or FPS gains.

“Windows defaults” removes supported registry overrides and uses Balanced if the power plan is selected. This is not an OEM factory reset or a Windows reinstall. Settings snapshots cover the supported preferences; Windows restore points have separate coverage. Restore app backups newest first.

This is an **unsigned Windows x64 tester build**. Windows may display an unknown-publisher or SmartScreen notice; organization-managed policies may require a signed build. PresentMon 2.3.0 and its MIT license are bundled; its official executable is checksum-verified during download, packaging, and capture startup.

Recordings stay on your PC. Each run is capped at 60 minutes, 64 MiB, or two million frame samples; the library holds 100 runs. Export/delete recordings in FPS recorder. Uninstall through Windows Settings → Apps. Profiles, restore backups, and recordings are preserved.

`SHA256SUMS.txt` contains the installer checksum. Before publication, the Windows workflow validates the application, native preference operations and restoration, real frame collection, packaged files, install, desktop launch, shortcuts, and uninstall.
