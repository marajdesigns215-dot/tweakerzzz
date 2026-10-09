# Marvel Rivals capture check — v0.6.3

The automated Windows test uses a Direct3D renderer to verify real frame events. The installed-app test checks real process search/selection. Neither runs Marvel Rivals, so a passing release workflow must not be described as live Marvel Rivals verification.

A supplied v0.6.2 Marvel Rivals CSV confirmed successful frame-event collection but also revealed repeated frame-start rows that inflated reported FPS. Version 0.6.3 corrects the timestamp calculation. Offline reanalysis validates that fix against the supplied data; a fresh matched game/counter capture is still useful for verification on a gaming PC. Keep the optional display-tracking compatibility test off for the initial check.

## Check the installed game

1. Install Tweakerzzz 0.6.3, close any older copy including its tray icon, and launch Marvel Rivals normally.
2. Enter the practice range and let loading/shader preparation settle. Keep the game rendering rather than minimized.
3. In **FPS recorder**, click **Find running programs**, search **Marvel** or **Rivals**, and select **Marvel-Win64-Shipping.exe** if listed. Do not select the launcher. If your game build uses another executable, choose **All programs** and verify the name in Task Manager → Details.
4. Choose **Before tweaks**, **Gaming**, **30 seconds**, and a scene label such as **Practice range — capture check**. Leave OBS disconnected. No tweaks need to be applied for this test.
5. Start the recording, return to the game and move around the same practice area for the full interval. Reopen Tweakerzzz after it finishes.
6. Confirm the history entry is **completed**, contains frame samples, and shows finite positive average FPS and frame-time results. Check that the executable is the intended game process. Export the CSV and summary as the evidence for this check. Note whether frame generation is on/off and which game/overlay counter you compare. Compare its average over this same interval, not a momentary value. Record the separate application/display averages and any measurement warnings.

A short successful capture establishes frame collection on that particular game/Windows/driver combination. It is not an FPS-gain claim, a stability guarantee or a controlled before/after benchmark. Use longer repeated matched runs for performance comparisons.

## If no frames arrive

- If the app reports the executable missing, refresh the running programs and select the exact live process. Launching a preset alone is not proof that its executable exists.
- Confirm the game remained open and rendering throughout. Check **Saved tweak states & collector notes**.
- If Windows denies tracing, or the game runs elevated, close Tweakerzzz and try **Run as administrator** under the same Windows account. Do not change anti-cheat, Windows security settings or system execution policy.
- Export the failed run's **summary** and **CSV**. Include app/game versions, Windows build, graphics driver version, selected process, and whether the game/app were elevated. Review exports before sharing because they contain local hardware/settings information.
- Do not count a failed run as a baseline or substitute OBS output FPS. A zero-frame result alone does not prove an anti-cheat restriction.

## Result record

Record pass/fail, date, game build, Windows build, driver, executable, duration, valid frame count and any collector warnings. Keep the original exports with the report. Game-specific support remains pending until an actual game run supplies this evidence.
