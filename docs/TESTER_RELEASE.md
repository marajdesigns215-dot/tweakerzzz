Download **Tweakerzzz-Setup-0.4.0-x64.exe** below. Quit the old app (including its tray icon), then run the installer. No Node/npm or PowerShell launch commands are needed.

**Bubblegum edition:** hot pink, thunder yellow, plum backgrounds, rounded controls, and an updated desktop/tray icon.

**Game and hardware recommendations:** Open FPS recorder, choose the game and Gaming/Streaming/Recording workload, then Scan for recommendations. Suggestions use your live CPU, GPU, RAM, driver, and current Windows settings, explain tradeoffs, and skip configured automatic tweaks. Every automatic change still goes through review and backup.

**Repeated before/after evidence:** Enable controlled benchmark conditions. Name the experiment and enter the same scene, resolution, graphics, FPS cap, and game build. Warm up and confirm conditions for each run. Record at least three Before and three After runs of 60+ usable seconds each. The app checks matching hardware/driver/conditions and exact supported setting snapshots, then flags consistent improvement, regression, or insufficient evidence. Groups of tweaks remain grouped; results are observations, not guaranteed causation.

**CPU/GPU and OBS measurements:** Enable extra measurements before recording. CPU/RAM are collected directly. NVIDIA GPU load/temperature require an available matching driver provider. CPU package temperature uses an already-running Libre Hardware Monitor WMI provider; no sensor driver is installed. Unsupported readings stay unavailable.

**OBS setup:** Enable OBS → Tools → WebSocket Server Settings, then enter the local port/password under OBS connection. The connection is read-only and local to this PC. Passwords are held in memory only. Start your stream/recording before the test; OBS rendering lag, encoding lag, and network drops use counter deltas. Reconnect after restarting Tweakerzzz. Streaming/recording recommendations from repeated tests require valid OBS measurements.

Restore center still supports snapshots, exact backup restoration, selective tweak disable, Windows-managed defaults, and a shortcut to Windows System Protection. Windows defaults is not an OEM factory reset. Closing the window during FPS recording keeps it running in the system tray; stop or quit from the tray.

This is an **unsigned Windows x64 tester build**. Windows tracing may require Run as administrator under the same account. Game/API and sensor compatibility varies; no FPS gain is promised. Sampling adds overhead, so use the same telemetry choice before/after. The real Direct3D test validates frame collection; OBS protocol and sensor parsing tests use fixtures and do not establish compatibility with every real device/OBS setup.

Profiles, backups, and recordings are preserved when uninstalling. Logs remain local until exported. SHA256SUMS.txt contains the installer checksum. The workflow validates the build, native backup/restore, real frame capture, hardware/setting snapshots, telemetry fallback, packaged resources, install, launch, shortcuts, and uninstall before publishing.
