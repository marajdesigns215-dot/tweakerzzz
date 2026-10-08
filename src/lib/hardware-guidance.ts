import type { SystemScan } from '../types.ts';

export const emptyHardware: SystemScan = {
  cpu: { name: 'Processor not scanned', cores: null, threads: null },
  gpu: { name: 'Graphics not scanned', vramGB: null },
  memory: { totalGB: null, speedMHz: null }, os: { name: 'Windows not scanned', build: 'Not scanned' },
  storage: { totalGB: null, freeGB: null }, peripherals: [], scannedAt: '',
};

/** Model-family hints, not a probe of encoders exposed by OBS or the driver.
 * Unknown/ambiguous names never inherit a known reference machine's features. */
export function gpuCapabilities(hardware: SystemScan | null) {
  const name = hardware?.gpu.name ?? '';
  const vendor: 'nvidia' | 'amd' | 'intel' | 'unknown' = /nvidia|geforce|quadro/i.test(name) ? 'nvidia' : /amd|radeon/i.test(name) ? 'amd' : /intel/i.test(name) ? 'intel' : 'unknown';
  const rtx = vendor === 'nvidia' && /\b(?:GeForce\s+)?RTX\s*(?:20|30|40|50)[5-9]\d\b/i.test(name) && !/quadro|workstation|\bAda\b/i.test(name);
  const newerRtx = rtx && /RTX\s*(?:40|50)\d\d\b/i.test(name);
  const nvenc = vendor === 'nvidia' && (rtx || /\bGTX\s*(?:9\d\d|10\d\d|16\d\d)\b/i.test(name));
  const rx = /\bRX\s*(4\d{2}|5\d{2}|5\d{3}|6\d{3}|7\d{3}|9\d{3})\b/i.exec(name);
  const amdEncoder = vendor === 'amd' && !!rx && !/^(?:6300|6400|6500)$/.test(rx[1]);
  const arc = vendor === 'intel' && /\bArc\s*(?:\(TM\)\s*)?[AB]\d{3}\b/i.test(name);
  const qsv = vendor === 'intel' && (arc || /\b(?:UHD|Iris)\b|\bHD Graphics\s+(?:[2-6]\d{3}|[456]\d{2})\b/i.test(name));
  const av1 = newerRtx || (amdEncoder && /^[79]\d{3}$/.test(rx![1])) || arc;
  const encoder = nvenc ? 'NVIDIA NVENC' : amdEncoder ? 'AMD HW' : qsv ? 'Intel Quick Sync' : null;
  return { name, vendor, rtx, newerRtx, nvenc, av1, encoder, h264: !!encoder };
}

export function memoryGuidance(hardware: SystemScan | null) {
  if (!hardware) return 'Scan this PC to read its installed memory capacity and configured speed.';
  const capacity = hardware.memory.totalGB == null ? 'Capacity was not reported' : `${hardware.memory.totalGB} GB installed`;
  const speed = hardware.memory.speedMHz == null ? 'configured speed was not reported' : `configured speed reported as ${hardware.memory.speedMHz.toLocaleString('en-US')} MHz`;
  return `${capacity}; ${speed}. Compare with the kit rating, motherboard support, and channel layout. The scan does not establish a target speed or validate an XMP/EXPO profile; firmware changes need stability testing.`;
}

export function encoderGuidance(hardware: SystemScan | null) {
  const gpu = gpuCapabilities(hardware);
  if (!hardware) return 'Scan this PC before choosing a hardware encoder. Use the encoders actually listed by your capture software.';
  if (!gpu.encoder) return `${gpu.name}: hardware encoding support was not established from this scan. Check the encoder list in your capture app or its configuration wizard; do not assume a dedicated encoder is available.`;
  return `${gpu.name}: check for ${gpu.encoder} H.264 in your capture app. ${gpu.av1 ? 'This model family also supports AV1 encoding; check destination and editor compatibility.' : 'Use a supported codec listed by the app; AV1 encoding is not established for this model.'} Keep GPU headroom for scene composition and test encoding lag.`;
}

export function displayGuidance(hardware: SystemScan | null) {
  const gpu = gpuCapabilities(hardware);
  const result = {
    nvidia: { color: 'Use NVIDIA Control Panel → Adjust desktop color settings for the selected NVIDIA output.', scaling: 'Use NVIDIA Control Panel → Adjust desktop size and position → Full-screen scaling on a supported output.', vrr: 'Check G-SYNC / G-SYNC Compatible for the connected display in NVIDIA Control Panel.', range: 'Review NVIDIA Control Panel → Change resolution → Output dynamic range.' },
    amd: { color: 'Use AMD Software: Adrenalin Edition → Display → Custom Color and adjust Saturation where supported.', scaling: 'Use AMD Software: Adrenalin Edition → Display → GPU Scaling, then Full panel where supported.', vrr: 'Check AMD FreeSync for the connected display in AMD Software.', range: 'Review AMD Software display pixel format and match RGB range to the monitor or capture device.' },
    intel: { color: 'Use the installed Intel Graphics Software or Graphics Command Center display color controls where supported.', scaling: 'Use the installed Intel graphics display controls to check supported full-screen scaling options.', vrr: 'Check Adaptive Sync in the installed Intel graphics software and the monitor menu where supported.', range: 'Review the installed Intel display controls for supported quantization/output range options.' },
    unknown: { color: 'Scan this PC, then use the software for the GPU actually driving the display. Color controls depend on the driver and output.', scaling: 'Check the connected display and its GPU software for supported full-screen scaling. Scan the PC to add vendor guidance.', vrr: 'Check the monitor and connected GPU documentation for compatible adaptive-sync support.', range: 'Check the connected GPU’s output-range controls and match the receiving display or capture device.' },
  }[gpu.vendor];
  return { ...result, vendor: gpu.vendor };
}

export function streamSettings(hardware: SystemScan | null, target: string, quality: string) {
  const gpu = gpuCapabilities(hardware), recording = target === 'Recording';
  // H.264 is the baseline for streaming. Do not assume a platform/account
  // accepts AV1 merely because the GPU can encode it.
  const codec = recording && gpu.av1 ? 'AV1' : 'H.264';
  const rows = [
    ['Encoder', gpu.encoder ? `${gpu.encoder} ${codec} · confirm in OBS` : 'Choose an available encoder in OBS after scanning'],
    ['Output resolution', quality === 'Competitive' ? '1280 × 720 (test baseline)' : '1920 × 1080 (test baseline)'],
    ['Frame rate', '60 FPS if sustainable; test 30 FPS if overloaded'],
    ['Rate control', recording ? 'Encoder-supported constant quality; start at its default' : 'CBR'],
    ['Bitrate', recording ? 'Quality based; check file size and disk throughput' : target === 'Twitch' ? '6,000 Kbps starting point; verify service limits / upload' : '8,000 Kbps starting point; verify service limits / upload'],
    ['Keyframe interval', recording ? 'OBS / encoder default' : '2 seconds; verify service requirements'],
  ];
  if (gpu.nvenc) rows.push(['Preset', quality === 'Quality' ? 'P6 · test for encoding lag' : 'P5 · test baseline'], ['Multipass', 'Single pass'], ['Look-ahead', 'Off as a test baseline']);
  else if (gpu.encoder) rows.push(['Preset', quality === 'Competitive' ? 'Default first; test a faster available preset if overloaded' : 'OBS default for this encoder; compare quality and lag']);
  else rows.push(['Preset', 'Use OBS Auto-Configuration Wizard; available encoders are unverified']);
  return { rows, note: encoderGuidance(hardware), gpu };
}
