Download **Tweakerzzz-Setup-0.7.1-x64.exe** below. Quit the old app including its tray icon, then run the installer. No Node/npm or PowerShell launch commands are needed.

**New in v0.7.1: installed and available driver versions for the PC being scanned.**

Open **Drivers & devices → Scan drivers & devices → Check latest versions**.

- The view now contains graphics, processors, motherboard, BIOS/UEFI, peripherals and audio. Miscellaneous device records are hidden. Chipset/platform driver versions appear inside the motherboard card.
- Compare installed versions with exact device-matched Windows Update offers across vendors. Each result identifies its source; no offers never means the latest manufacturer release is verified.
- NVIDIA GeForce adds an official live model/Windows lookup for Game Ready WHQL and non-beta Studio releases, with published notes. The feed's WHQL status is shown as reported. NVIDIA's public version is displayed alongside the raw Windows version.
- BIOS shows the installed firmware version and manufacturer support link. Automatic latest BIOS verification is not included. AMD/Intel/OEM GPU releases, chipset bundles, peripheral firmware and control apps can be newer than Windows Update and still need a manufacturer check.
- Local change history remains available. Exports retain diagnostic inventory, including records hidden from the simplified view; raw hardware/instance IDs are excluded by default.
- Tests cover different vendors, unknown hardware, mixed GPUs, platform/peripheral matching, cancellation, failures, stale results and narrow layouts. No reference gaming PC is loaded.

See [coverage, limitations and validation](https://github.com/marajdesigns215-dot/tweakerzzz/blob/v0.7.1/docs/HARDWARE_UPDATES.md). No driver installation or firmware flashing is performed.

**Includes the v0.6.4 workflow:** Overview / PC scanner → Drivers & devices → FPS recorder → Restore center → Optimizations → Peripherals → Streaming lab. Display studio, How it works and Updates remain available. Record an After run in the same scene after reviewed changes.

**Included from v0.6.3:**

**Fixed: inflated FPS from repeated frame-start rows.** A real capture exposed short CPUWait-only rows sharing the same frame-start timestamps as other rows. Counting both inflated FPS. Application FPS now uses consecutive distinct timestamps for one process/swap chain.

**Correct existing reports:** In FPS recorder, choose **Recalculate saved CSV** on an older recording. Original CSVs are preserved, and the original report is backed up before replacement. Missing display or hardware measurements cannot be reconstructed.

**Expanded reports:** Highest/lowest FPS over complete windows of at least one second, average FPS, 1%/0.1% lows, P95/P99 and worst frame time, variability, long-frame counts and an interactive timeline. **Collect displayed FPS** is an optional compatibility test, off by default. Where supported it is reported separately; if that mode returns no frames, turn it off and retry. The default application FPS recorder does not depend on display tracking. Diagnostics suggest reviewable tests without claiming a proven bottleneck or applying tweaks automatically. Optional telemetry adds busiest-logical-CPU load, available RAM and supported NVIDIA GPU-memory allocation. OBS is optional.

**Comparisons:** Capture matching new Before and After runs. Calculation versions and collector modes must match. Older or suspect measurements are excluded from repeated-run recommendations until valid recalculation.

**Validation:** Automated checks cover duplicate counting, distributions, application/display separation, backup-preserving reanalysis, exports, UI and native Windows collection. The Windows renderer independently counts and times Present calls as a check against FPS inflation. A supplied Marvel Rivals CSV confirmed the defect and corrected offline analysis; a fresh matched game/counter test on a gaming PC is still needed. See the [measurement definitions](https://github.com/marajdesigns215-dot/tweakerzzz/blob/v0.6.3/docs/FPS_MEASUREMENT.md) and [Marvel Rivals test](https://github.com/marajdesigns215-dot/tweakerzzz/blob/v0.6.3/docs/MARVEL_RIVALS_TEST.md).

**Already on v0.6.0 or newer?** Use **Updates → Check for updates → Download → Review installation → Install & restart**. Checks, downloads and installation are manual. Finish any active recording, Windows change, resolution test or color observer first. Saved profiles, backups and recordings are retained. Users on 0.5.2 or older need this installer once to enable future in-app updates.

**Includes the v0.6.1 protected-registry fix:** Selected tweaks receive a read-only permission check before changes begin. Blocked tweaks are identified for review; you can remove them and review the remaining plan. Late permission failures roll back the transaction. Windows access restrictions, registry ownership and permissions remain intact.

**QA fixes in v0.5.2:** Resolution tests now send the mode shown in the controls and use only reported resolution/refresh-rate pairs. Empty or failed mode queries no longer offer sample modes. Damaged FPS history files no longer blank the app or block valid recordings; files are preserved with a recovery notice. Comparisons reject missing hardware/benchmark information on one side, and older runs disclose unverified hardware. Late failures from obsolete hardware scans no longer replace the current scan notification. Added an installed Windows app walkthrough alongside the existing native and installer tests.

**Hardware guidance fix:** No owner/tester reference build is preloaded. Scans now update advice across tabs. NVIDIA, AMD, Intel, and unknown graphics use applicable encoder/display guides; memory guidance uses the reported capacity and speed. Failed rescans clear old guidance, imports stay labeled, and late scan responses cannot overwrite newer reports. The catalog includes 89 entries, filtered by hardware, with 22 reversible automatic preferences.

**Standalone FPS recorder:** OBS is optional in every mode. FPS, 1% lows, frame times, CPU/RAM and supported GPU measurements work without connecting OBS. Select the game executable and scene, then Start background recording. Repeated-run comparisons without OBS are labeled FPS only; connect OBS only if you want its own lag/drop measurements and output-quality checks.

**Automatic game vibrance:** Display studio now has NVIDIA digital-vibrance profiles for the foreground game/program on a selected monitor. Choose the monitor, add the real game executable, set desktop/game levels, confirm SDR (HDR off), then Save & start observer. Stop or quit to restore the original driver level; closing the window keeps an active observer in the tray. Profiles do not auto-start at login. AMD, Intel, hybrid/remote outputs, and unsupported NVIDIA controls stay unavailable. Brightness/contrast/warmth remain preview-only. Physical NVIDIA color changes still require tester validation; CI checks the helper and unsupported-hardware path without changing a display.

**Drivers & devices:** Scan actual motherboard/system/BIOS, GPU/CPU, storage, component driver versions, and peripherals for official vendor support links. Match the exact model, board/device revision, and Windows version before downloading. Fan software is suggested for the motherboard or identifiable USB controller; individual ordinary fans usually cannot be detected. Support directories are not verified exact-model updates. The separate Update offers tab checks the configured Windows Update source with the limits above. No automatic downloads, installs, BIOS flashes, or firmware changes.

**Settings snapshot fix:** Saving a snapshot no longer launches the downloaded `tweaks.ps1` file. It uses a fixed read-only query and preserves the same exact-value backup format without changing execution policy. Windows validation reproduces an Internet-zone-marked script and checks all 22 saved preferences. For tester installation, download the **.exe asset**, not GitHub’s “Source code (zip)”. Apply/restore from a source ZIP still requires trusting/unblocking that ZIP or using an approved distribution.

**Bubblegum edition:** hot pink, thunder yellow, plum backgrounds, rounded controls, and an updated desktop/tray icon.

**Game and hardware recommendations:** Open FPS recorder, choose the game and Gaming/Streaming/Recording workload, then Scan for recommendations. Suggestions use your live CPU, GPU, RAM, driver, and current Windows settings, explain tradeoffs, and skip configured automatic tweaks. Every automatic change still goes through review and backup.

**Repeated before/after evidence:** Enable controlled benchmark conditions. Name the experiment and enter the same scene, resolution, graphics, FPS cap, and game build. Warm up and confirm conditions for each run. Record at least three Before and three After runs of 60+ usable seconds each. The app checks matching hardware/driver/conditions and exact supported setting snapshots, then flags consistent improvement, regression, or insufficient evidence. Groups of tweaks remain grouped; results are observations, not guaranteed causation.

**CPU/GPU and OBS measurements:** Enable extra measurements before recording. CPU/RAM are collected directly. NVIDIA GPU load/temperature require an available matching driver provider. CPU package temperature uses an already-running Libre Hardware Monitor WMI provider; no sensor driver is installed. Unsupported readings stay unavailable.

**OBS setup:** Enable OBS → Tools → WebSocket Server Settings, then enter the local port/password under OBS connection. The connection is read-only and local to this PC. Passwords are held in memory only. Start your stream/recording before the test; OBS rendering lag, encoding lag, and network drops use counter deltas. Reconnect after restarting Tweakerzzz. FPS recordings, comparisons, and repeated-run findings work without OBS in Gaming, Streaming, and Recording modes. Without OBS, findings are labeled FPS only; creation quality is not assessed.

Restore center still supports snapshots, exact backup restoration, selective tweak disable, Windows-managed defaults, and a shortcut to Windows System Protection. Windows defaults is not an OEM factory reset. Closing the window during FPS recording keeps it running in the system tray; stop or quit from the tray.

This is an **unsigned Windows x64 tester build**. Windows tracing may require Run as administrator under the same account. Game/API and sensor compatibility varies; no FPS gain is promised. Sampling adds overhead, so use the same telemetry choice before/after. The real Direct3D test validates frame collection; OBS protocol and sensor parsing tests use fixtures and do not establish compatibility with every real device/OBS setup.

Profiles, backups, and recordings are preserved when uninstalling. Logs remain local until exported. SHA256SUMS.txt contains the installer checksum. The workflow validates the build, native backup/restore, real frame capture, hardware/setting snapshots, telemetry fallback, packaged resources, install, launch, shortcuts, and uninstall before publishing.
