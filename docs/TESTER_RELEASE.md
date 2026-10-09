Download **Tweakerzzz-Setup-0.6.2-x64.exe** below. Quit the old app (including its tray icon), then run the installer. No Node/npm or PowerShell launch commands are needed. Download the **.exe asset**, not GitHub's Source code ZIP.

**Fixed in v0.6.2 — running-game selection and recording:**

- **Find running programs** now opens a searchable, scrollable list with large clickable rows. Filter recognized games, or choose **All programs** for other games/applications.
- Search by executable name or recognized game title. The Marvel Rivals preset now uses `Marvel-Win64-Shipping.exe`; select the actual running process if your build differs.
- Before recording, the app checks that the selected process is running. Missing targets are rejected without saving an empty recording.
- **Retry recording** preserves the Before/After phase of a failed or interrupted run. Zero-frame results now include clearer tracing troubleshooting.
- OBS remains optional; existing recordings and settings remain readable.

**Windows verification:** The release workflow tests real Direct3D frame capture, live Windows process search/selection inside the installed app, and upgrading from 0.6.1 while retaining saved data. **Live Marvel Rivals capture is still pending a tester run on a Windows PC with the game.** Passing the Direct3D test does not establish compatibility with that game. Use the [30-second Marvel Rivals capture check](https://github.com/marajdesigns215-dot/tweakerzzz/blob/v0.6.2/docs/MARVEL_RIVALS_TEST.md), then export the CSV and summary if capture fails.

**Already on v0.6.0 or newer?** Use **Updates → Check for updates → Download → Review installation → Install & restart**. Checks, downloads and installation are manual. Finish any active recording, Windows change, resolution test or color observer first. Saved profiles, backups and recordings are retained. Users on 0.5.2 or older need this installer once to enable future in-app updates.

**Includes the v0.6.1 protected-registry fix:** Selected tweaks receive a read-only permission check before changes begin. Blocked tweaks are identified for review; you can remove them and review the remaining plan. Late permission failures roll back the transaction. Windows access restrictions, registry ownership and permissions remain intact.

**QA fixes in v0.5.2:** Resolution tests now send the mode shown in the controls and use only reported resolution/refresh-rate pairs. Empty or failed mode queries no longer offer sample modes. Damaged FPS history files no longer blank the app or block valid recordings; files are preserved with a recovery notice. Comparisons reject missing hardware/benchmark information on one side, and older runs disclose unverified hardware. Late failures from obsolete hardware scans no longer replace the current scan notification. Added an installed Windows app walkthrough alongside the existing native and installer tests.

**Hardware guidance fix:** No owner/tester reference build is preloaded. Scans now update advice across tabs. NVIDIA, AMD, Intel, and unknown graphics use applicable encoder/display guides; memory guidance uses the reported capacity and speed. Failed rescans clear old guidance, imports stay labeled, and late scan responses cannot overwrite newer reports. The catalog includes 89 entries, filtered by hardware, with 22 reversible automatic preferences.

**Standalone FPS recorder:** OBS is optional in every mode. FPS, 1% lows, frame times, CPU/RAM and supported GPU measurements work without connecting OBS. Select the game executable and scene, then Start background recording. Repeated-run comparisons without OBS are labeled FPS only; connect OBS only if you want its own lag/drop measurements and output-quality checks.

**Automatic game vibrance:** Display studio now has NVIDIA digital-vibrance profiles for the foreground game/program on a selected monitor. Choose the monitor, add the real game executable, set desktop/game levels, confirm SDR (HDR off), then Save & start observer. Stop or quit to restore the original driver level; closing the window keeps an active observer in the tray. Profiles do not auto-start at login. AMD, Intel, hybrid/remote outputs, and unsupported NVIDIA controls stay unavailable. Brightness/contrast/warmth remain preview-only. Physical NVIDIA color changes still require tester validation; CI checks the helper and unsupported-hardware path without changing a display.

**Drivers & devices:** Scan actual motherboard/system/BIOS, GPU/CPU, storage, component driver versions, and peripherals for official vendor support links. Match the exact model, board/device revision, and Windows version before downloading. Fan software is suggested for the motherboard or identifiable USB controller; individual ordinary fans usually cannot be detected. These are support recommendations, not verified update availability. No automatic downloads, installs, BIOS flashes, or firmware changes.

**Settings snapshot fix:** Saving a snapshot no longer launches the downloaded `tweaks.ps1` file. It uses a fixed read-only query and preserves the same exact-value backup format without changing execution policy. Windows validation reproduces an Internet-zone-marked script and checks all 22 saved preferences. For tester installation, download the **.exe asset**, not GitHub’s “Source code (zip)”. Apply/restore from a source ZIP still requires trusting/unblocking that ZIP or using an approved distribution.

**Bubblegum edition:** hot pink, thunder yellow, plum backgrounds, rounded controls, and an updated desktop/tray icon.

**Game and hardware recommendations:** Open FPS recorder, choose the game and Gaming/Streaming/Recording workload, then Scan for recommendations. Suggestions use your live CPU, GPU, RAM, driver, and current Windows settings, explain tradeoffs, and skip configured automatic tweaks. Every automatic change still goes through review and backup.

**Repeated before/after evidence:** Enable controlled benchmark conditions. Name the experiment and enter the same scene, resolution, graphics, FPS cap, and game build. Warm up and confirm conditions for each run. Record at least three Before and three After runs of 60+ usable seconds each. The app checks matching hardware/driver/conditions and exact supported setting snapshots, then flags consistent improvement, regression, or insufficient evidence. Groups of tweaks remain grouped; results are observations, not guaranteed causation.

**CPU/GPU and OBS measurements:** Enable extra measurements before recording. CPU/RAM are collected directly. NVIDIA GPU load/temperature require an available matching driver provider. CPU package temperature uses an already-running Libre Hardware Monitor WMI provider; no sensor driver is installed. Unsupported readings stay unavailable.

**OBS setup:** Enable OBS → Tools → WebSocket Server Settings, then enter the local port/password under OBS connection. The connection is read-only and local to this PC. Passwords are held in memory only. Start your stream/recording before the test; OBS rendering lag, encoding lag, and network drops use counter deltas. Reconnect after restarting Tweakerzzz. FPS recordings, comparisons, and repeated-run findings work without OBS in Gaming, Streaming, and Recording modes. Without OBS, findings are labeled FPS only; creation quality is not assessed.

Restore center still supports snapshots, exact backup restoration, selective tweak disable, Windows-managed defaults, and a shortcut to Windows System Protection. Windows defaults is not an OEM factory reset. Closing the window during FPS recording keeps it running in the system tray; stop or quit from the tray.

This is an **unsigned Windows x64 tester build**. Windows tracing may require Run as administrator under the same account. Game/API and sensor compatibility varies; no FPS gain is promised. Sampling adds overhead, so use the same telemetry choice before/after. The real Direct3D test validates frame collection; OBS protocol and sensor parsing tests use fixtures and do not establish compatibility with every real device/OBS setup.

Profiles, backups, and recordings are preserved when uninstalling. Logs remain local until exported. SHA256SUMS.txt contains the installer checksum. The workflow validates the build, native backup/restore, real frame capture, hardware/setting snapshots, telemetry fallback, packaged resources, install, launch, shortcuts, and uninstall before publishing.
