import type { Peripheral } from '../types';

export interface PeripheralGuide {
  profile: string;
  basis: string;
  steps: { title: string; detail: string }[];
}
const step = (title: string, detail: string) => ({ title, detail });

/** Suggestions only: USB names/IDs do not prove active DPI, polling, firmware,
 * camera modes, or sample rates. Unknown models receive category guidance. */
export function peripheralGuide(device: Peripheral | null, category: string): PeripheralGuide {
  const type = device?.type ?? category;
  const name = device?.name ?? '';
  const named = !!device && (!device.identification || ['reported', 'usb-id'].includes(device.identification));
  const g203 = type === 'Mouse' && (['046D:C084', '046D:C092', '046D:C09D'].includes(device?.usbId ?? '') || (named && /\blogitech\b/i.test(name) && /\bg(?:102|203)\b/i.test(name)));
  const ep84 = type === 'Keyboard' && named && /\bEP[- ]?84\b/i.test(name);
  const voidHeadset = type === 'Audio' && named && /\bcorsair\b.*\bvoid\b/i.test(name);
  const basis = !device ? 'Category guidance. Select a detected device for a matching profile.'
    : device.identification === 'usb-id' ? 'Matched by USB vendor/product ID. Shared product IDs identify a family.'
    : device.identification === 'vendor-only' || device.identification === 'generic' ? 'Category guidance: Windows did not expose an exact model.'
    : 'Based on the product name supplied by Windows.';

  if (g203) return { profile: 'Logitech G102 / G203', basis, steps: [
    step('Use the supported 1,000 Hz report rate', 'In Logitech G HUB, choose 1,000 Hz for this mouse. Compare frame times in your game; if CPU load or stutter increases, test 500 Hz. These models do not need an 8,000 Hz setting.'),
    step('Keep a consistent DPI stage', 'Choose a comfortable DPI, such as 800 or 1,600, then adjust in-game sensitivity. Remove unused DPI stages if accidental DPI switching disrupts aim. Higher DPI does not increase FPS.'),
    step('Use raw input in the game', 'Enable raw mouse input where the game offers it. Disabling Windows pointer acceleration affects desktop movement; raw-input games generally handle mouse motion independently.'),
    step('Save the profile, then test background overhead', 'If G HUB offers onboard memory for your variant, save the required profile and verify it survives closing G HUB. Compare game frame times before deciding whether the utility needs to stay open.'),
  ] };
  if (ep84) return { profile: 'Epomaker EP-84', basis, steps: [
    step('Keep the wired USB connection stable', 'Connect the keyboard directly to a motherboard USB port for troubleshooting. Compare input behavior if a hub shared with a webcam or capture device causes dropouts.'),
    step('Use the utility for the exact EP-84 variant', 'Match the model and revision printed on the keyboard to Epomaker’s official downloads. Use its supported remapping and lighting controls; the EP-84 name alone does not establish adjustable actuation or rapid-trigger support.'),
    step('Review accessibility key delays', 'If you do not use Filter Keys or Sticky Keys, review their Windows settings and shortcut prompts. Keep any features you rely on; registry repeat-rate tweaks do not raise the keyboard’s USB polling rate.'),
    step('Check background software after saving', 'Save any supported onboard profile, close the vendor utility, and verify keys and lighting still work as intended. Keep software running when a required feature depends on it.'),
  ] };
  if (voidHeadset) return { profile: 'Corsair VOID headset', basis, steps: [
    step('Choose the intended playback and microphone endpoints', 'Select the VOID headset and its microphone explicitly in Windows, OBS, and voice chat. Its playback and capture endpoints are interfaces of the same headset.'),
    step('Match supported sample rates', 'Use a consistent supported sample rate across Windows and OBS, commonly 48 kHz. Check the device’s available formats before selecting a rate.'),
    step('Compare iCUE processing while gaming', 'Test spatial audio, EQ, and microphone effects individually. Compare sound clarity and capture behavior; keep features you use. Disabling effects is not a guaranteed FPS gain.'),
    step('Avoid duplicate microphone monitoring', 'Monitor through one intended path. Using both Windows Listen and OBS monitoring can create echo or delayed audio.'),
  ] };

  const generic: Record<string, PeripheralGuide['steps']> = {
    Mouse: [
      step('Choose a supported polling rate', 'Use the manufacturer’s utility to inspect available rates. If 1,000 Hz is supported, use it as a starting point and compare game frame times. Higher polling can add CPU overhead.'),
      step('Keep DPI and sensitivity consistent', 'Set a comfortable DPI and use raw input in supported games. Tune in-game sensitivity without changing several settings between tests.'),
      step('Check the connection', device?.connection === 'Bluetooth' ? 'If this model supports wired USB or its own gaming receiver, compare input latency with those connections. Bluetooth does not expose every vendor feature.' : 'Use a stable USB connection. If using a receiver, keep it near the mouse and away from sources of interference.'),
    ],
    Keyboard: [
      step('Use a stable USB connection', 'Test a direct motherboard connection if a shared hub causes missed input or disconnects. Changing ports does not increase the keyboard’s rated polling speed.'),
      step('Check supported model features', 'Use the exact model’s official utility for remapping, firmware, and any supported actuation settings. Generic HID names do not establish rapid-trigger or adjustable-actuation support.'),
      step('Review accessibility shortcuts', 'Review Filter Keys and Sticky Keys if their delays or prompts interrupt play. Keep any accessibility features you use.'),
    ],
    Audio: [
      step('Match supported sample rates', 'Use the same supported sample rate across Windows, OBS, and your audio interface, commonly 48 kHz.'),
      step('Test audio processing individually', 'Compare spatial audio and enhancements one at a time for clarity and latency. Keep the processing that supports your workflow.'),
      step('Use one monitoring path', 'Avoid monitoring the same microphone in Windows and OBS simultaneously. Hardware monitoring is an option when the device supports it.'),
    ],
    Camera: [
      step('Match capture size to the scene', 'For a small facecam, try an advertised 1280 × 720 mode at 30 FPS in OBS. Use 1920 × 1080 when available and the larger image is useful. A “1080p” product name does not establish 60 FPS support.'),
      step('Choose a format the camera advertises', 'In OBS Video Capture Device properties, select a listed resolution, FPS, and format. MJPEG can reduce USB bandwidth but requires decoding; compare it with other supported formats while checking OBS rendering and encoding lag.'),
      step('Stabilize exposure and lighting', 'Improve lighting before raising exposure. If supported, use an exposure setting that maintains the selected frame rate, and match anti-flicker to local lighting frequency.'),
      step('Reduce unused capture work', 'If reconnect behavior is reliable, test OBS’s “Deactivate when not showing” option. Avoid sharing an overloaded USB hub with a capture card, and check camera startup when changing scenes.'),
    ],
    Controller: [
      step('Compare supported connections', 'Use USB as a baseline, then compare wireless latency and reliability in the same game.'),
      step('Use one input translation layer', 'Avoid overlapping remapping tools. Prefer native game support or one controller mapping layer.'),
      step('Tune dead zones after checking firmware', 'Use the manufacturer’s official utility when available. Reduce dead zones only as far as drift permits.'),
    ],
  };
  return { profile: `${type} starting settings`, basis, steps: generic[type] ?? generic.Mouse };
}
