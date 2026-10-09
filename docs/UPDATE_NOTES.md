Tweakerzzz 0.6.3 fixes inflated FPS from repeated frame-start rows and expands performance reports.

- Application FPS now counts intervals between distinct frame starts. Duplicate CSV rows no longer inflate FPS.
- Older recordings show a warning and offer Recalculate saved CSV. Original CSVs and an original-report backup are preserved.
- Reports add highest/lowest FPS over complete windows of at least one second, average FPS, 1%/0.1% lows, P95/P99 and worst frame time, variability, and long-frame counts.
- Explore an interactive FPS timeline and review measured diagnostic signals with suggested tests.
- Collect displayed FPS is an optional compatibility test, off by default; supported captures show it separately. Some environments return no data in that mode; turn it off and retry. Unsupported display data stays unavailable.
- Optional telemetry adds busiest-logical-CPU load, minimum available RAM and supported NVIDIA GPU-memory use. OBS remains optional.
- Comparisons reject mixed calculation/collector versions; older or suspect measurements cannot drive repeated-run recommendations.

After installing, open FPS recorder and choose Recalculate saved CSV on an older report. Start matched new Before and After captures for future comparisons. A supplied Marvel Rivals CSV verified the duplicate-counting defect and corrected analysis; fresh in-game counter comparison is still needed on a gaming PC.

This is an unsigned Windows x64 beta. Profiles, backups and recordings are retained. On v0.6.0 or newer, use Updates → Check for updates → Download → Review installation → Install & restart.
