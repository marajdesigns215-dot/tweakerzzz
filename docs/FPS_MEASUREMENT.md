# FPS measurement and report accuracy

## Corrected calculation (v0.6.3)

A real supplied capture contained repeated `CPUStartTime` values for the same process and swap chain: a short, CPUWait-only row shared its frame start with a longer row. Counting every positive `FrameTime` row as another application frame inflated FPS and even made summed frame durations exceed the recording's wall-clock duration. This is a confirmed parser/measurement defect, not evidence that the game enabled frame generation.

Application cadence now uses the millisecond difference between **consecutive distinct CPUStartTime values in one process/swap chain**. Repeated starts do not add application intervals. The first start establishes the clock, so N distinct starts yield N−1 measured intervals. Out-of-order or missing timestamps are disclosed and exclude a run from repeated benchmark recommendations. Pauses and long intervals remain in the result. The most sampled application stream is selected; other streams are disclosed rather than combined.

- Average FPS: `interval count × 1000 / sum(interval milliseconds)`. Never average instantaneous FPS values.
- 1% low: `1000 / mean(slowest ceil(N × 0.01) intervals)`, requiring at least 100 intervals.
- 0.1% low: same definition for the slowest 0.001 fraction, requiring 1,000 intervals.
- Highest/lowest FPS: the maximum/minimum duration-weighted FPS of complete consecutive blocks, each accumulating **at least 1,000 ms**. Blocks can extend beyond one second by the boundary frame. The final partial block is excluded from peaks only. These are not instantaneous single-frame reciprocals or rolling-window maxima.
- P95/P99: nearest-rank frame-time percentiles. Standard deviation uses the population of measured intervals; longest interval and counts strictly over 50/100 ms are included. These are descriptive pacing metrics, not input latency or causal stutter diagnoses.
- Timeline: at most 120 complete blocks over sampled time, with exact interval boundaries and average FPS. Averages/lows still include intervals outside the chart's last complete block.

## Displayed FPS

Normal recordings retain application-only collection. **Collect displayed FPS** is an optional compatibility test, off by default, that enables PresentMon display tracking and frame-type reporting while leaving input and per-frame GPU-work tracking off. Some environments produce no CSV data in this mode even though the renderer is submitting frames; that run is explicitly unsuccessful and the UI directs the user to turn the option off and retry. The app never silently changes measurement modes during a recording. `DisplayedTime` durations produce a separate displayed-cadence distribution. These rows are never added to application FPS. Generated/repeated display updates may be included; provider frame-type detection is not universal, and zero identified generated rows does **not** establish that frame generation is disabled. Displayed FPS is not a measurement of game simulation rate, physical monitor refresh or input latency. Missing display timings remain unavailable.

Enabling the optional display mode changes collector overhead relative to application-only captures. Comparisons require the same calculation version, timing basis and collector mode. Old captures recalculated from CSV use the same application-only collector mode as new default captures. Comparison still requires matching hardware, settings, workload and other conditions. Use matched new Before and After runs when enabling the optional display-tracking collector.

## Existing reports

Choose **Recalculate saved CSV** on an older recording. Only its own validated recording ID can be used. The original CSV is never modified; the first original metadata file is copied to `<id>.before-analysis.json` before an atomic replacement of the current report. The backup is not listed as another recording and is deleted with the recording if you choose permanent deletion. Failed reanalysis leaves the existing report intact.

Legacy CSVs without CPUStartTime can only use the older FrameTime calculation and receive a warning. Missing display or telemetry data cannot be reconstructed. Older calculations are excluded from repeated recommendation evidence until valid recalculation; malformed files remain preserved.

## Diagnostic scope

The report shows measured pacing signals and suggests controlled tests. Overall CPU/GPU use does not prove a bottleneck. Optional telemetry adds busiest-logical-CPU sampled utilization, minimum available system RAM, and supported NVIDIA device-memory allocation from the existing provider. GPU memory allocation is not evidence of eviction. Temperatures without clock/throttle measurements do not establish overheating or throttling. CPU/RAM and GPU samples remain system/device-wide, sampled approximately every five seconds; short spikes may be missed. OBS remains optional.

No automatic tweaks are applied from a report. No expected FPS gains, sensor values, driver capabilities or shader/storage causes are invented.

## Verification and sources

Synthetic regression tests reproduce repeated timestamps and independently check intervals, sustained peaks, low-percentile calculations, display separation, malformed data, and backup-preserving reanalysis. The supplied private CSV was also reprocessed locally and cross-checked independently; it is not committed or published. Browser checks cover report controls, timeline navigation, exports, recalculation and layout. The Windows Direct3D probe checks real capture against independently timed successful Present calls (25% tolerance for different startup windows on shared CI), then verifies live and saved-CSV analysis agree. A separate optional-mode check accepts either real data or an explicit unsupported/zero-frame result, never invented FPS. The mandatory application-only capture must pass. This does not substitute for a matched in-game counter comparison on a gaming PC.

Pinned PresentMon 2.3.0 references:

- [Console CSV definitions and flags](https://github.com/GameTechDev/PresentMon/blob/v2.3.0/README-ConsoleApplication.md)
- [CSV output source: CPUStartTime is written in milliseconds](https://github.com/GameTechDev/PresentMon/blob/v2.3.0/PresentMon/CsvOutput.cpp)
- [Frame/display metric construction](https://github.com/GameTechDev/PresentMon/blob/v2.3.0/PresentMon/OutputThread.cpp)

Game counters may use another sampling window or frame definition. Compare the same scene and interval, record the frame-generation setting, and retain raw CSV plus summary when investigating a mismatch.
