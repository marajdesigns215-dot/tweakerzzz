const { test } = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../scripts/windows/tweaks.json');
const { recommendDrivers } = require('../electron/drivers.cjs');

async function modules() {
  return { ...await import('../src/lib/hardware-guidance.ts'), ...await import('../src/lib/tweak-catalog.ts'), ...await import('../src/lib/recommendations.ts') };
}
function hardware(name, extra = {}) {
  return { cpu: { name: 'Intel Core i5-12400', cores: 6, threads: 12 }, gpu: { name, vramGB: null }, memory: { totalGB: 64, speedMHz: 5200 }, os: { name: 'Windows 11', build: '26200' }, storage: { totalGB: 1000, freeGB: 500 }, peripherals: [], scannedAt: '2026-10-08T00:00:00Z', ...extra };
}
const cases = [
  ['NVIDIA GeForce RTX 2060', 'NVIDIA NVENC', false],
  ['NVIDIA GeForce RTX 3060 Laptop GPU', 'NVIDIA NVENC', false],
  ['NVIDIA GeForce RTX 4070 SUPER', 'NVIDIA NVENC', true],
  ['NVIDIA GeForce RTX 5090', 'NVIDIA NVENC', true],
  ['NVIDIA GeForce GTX 1060', 'NVIDIA NVENC', false],
  ['NVIDIA GeForce MX450', null, false],
  ['NVIDIA RTX A4000', null, false],
  ['NVIDIA Quadro RTX 5000', null, false],
  ['AMD Radeon RX 580', 'AMD HW', false],
  ['AMD Radeon RX 6950 XT', 'AMD HW', false],
  ['AMD Radeon RX 6500 XT', null, false],
  ['AMD Radeon RX 6400', null, false],
  ['AMD Radeon RX 7800 XT', 'AMD HW', true],
  ['AMD Radeon RX 9070 XT', 'AMD HW', true],
  ['AMD Radeon Graphics', null, false],
  ['Intel(R) Arc(TM) A770 Graphics', 'Intel Quick Sync', true],
  ['Intel Arc B580 Graphics', 'Intel Quick Sync', true],
  ['Intel(R) UHD Graphics 770', 'Intel Quick Sync', false],
  ['Intel HD Graphics 4000', 'Intel Quick Sync', false],
  ['Intel HD Graphics', null, false],
  ['Microsoft Basic Display Adapter', null, false],
  ['Unrecognized RTX 4090-like adapter', null, false],
];

test('encoder guidance handles multiple GPU generations, vendors, integrated graphics and ambiguous devices', async () => {
  const { gpuCapabilities, streamSettings } = await modules();
  for (const [name, encoder, av1] of cases) {
    const scan = hardware(name), caps = gpuCapabilities(scan);
    assert.equal(caps.encoder, encoder, name); assert.equal(caps.av1, av1, name);
    const recording = streamSettings(scan, 'Recording', 'Quality');
    assert.match(recording.rows[0][1], encoder ? new RegExp(encoder + (av1 ? ' AV1' : ' H.264')) : /Choose an available encoder/, name);
    if (encoder !== 'NVIDIA NVENC') assert.ok(!recording.rows.some(([key]) => ['Look-ahead', 'Multipass'].includes(key)), name);
    for (const target of ['Twitch', 'YouTube']) assert.ok(!streamSettings(scan, target, 'Balanced').rows[0][1].includes('AV1'), name);
  }
});

test('catalog and game recommendations share applicability rules without removing generic automatic settings', async () => {
  const { tweaksForHardware, recommend } = await modules();
  for (const [name, encoder, av1] of cases) {
    const scan = hardware(name), catalog = tweaksForHardware(scan), ids = new Set(catalog.map(t => t.id));
    assert.deepEqual(catalog.filter(t => t.mode === 'automatic').map(t => t.id).sort(), manifest.map(t => t.id).sort(), name);
    assert.equal(ids.has('obs-nvenc-h264'), encoder === 'NVIDIA NVENC', name);
    assert.equal(ids.has('obs-nvenc-av1'), encoder === 'NVIDIA NVENC' && av1, name);
    assert.equal(ids.has('obs-hardware-h264'), !!encoder && encoder !== 'NVIDIA NVENC', name);
    assert.equal(ids.has('obs-hardware-av1'), !!encoder && encoder !== 'NVIDIA NVENC' && av1, name);
    const advice = recommend({ processName: 'fortniteclient-win64-shipping.exe', context: 'Recording', hardware: scan, settings: null });
    for (const item of advice.items.filter(t => /nvenc|hardware-h264|hardware-av1|reflex|dlss/.test(t.id))) assert.ok(ids.has(item.id), name + ':' + item.id);
    assert.doesNotMatch(JSON.stringify(catalog), /5900X|4060|3200|3,200|Check AMD chipset/);
  }
});

test('memory, VRAM and display instructions use the actual report and leave unknown fields unknown', async () => {
  const { tweaksForHardware, memoryGuidance, displayGuidance, streamSettings } = await modules();
  const amd = hardware('AMD Radeon RX 6950 XT', { memory: { totalGB: 32, speedMHz: 2133 } });
  assert.match(memoryGuidance(amd), /2,133 MHz/); assert.doesNotMatch(memoryGuidance(amd), /3,200/);
  assert.match(memoryGuidance(hardware('Intel UHD Graphics 770')), /64 GB.*5,200 MHz/);
  assert.match(displayGuidance(amd).scaling, /AMD Software/);
  assert.match(displayGuidance(hardware('Intel Arc B580')).color, /Intel/);
  for (const id of ['vibrance-profile', 'stretched-resolution', 'vrr-setup', 'rgb-range']) assert.doesNotMatch(JSON.stringify(tweaksForHardware(amd).find(t => t.id === id)), /NVIDIA/);
  assert.match(tweaksForHardware(amd).find(t => t.id === 'vram-budget').details, /capacity was not reported/);
  const unknown = tweaksForHardware(null);
  assert.ok(!unknown.some(t => /nvenc|nvidia-reflex|dlss|frame-generation/.test(t.id)));
  assert.match(streamSettings(null, 'Recording', 'Balanced').note, /Scan this PC/);
  assert.match(memoryGuidance(hardware('Unknown', { memory: { totalGB: null, speedMHz: null } })), /Capacity was not reported; configured speed was not reported/);
});

test('driver guidance never assigns an unrelated vendor, board or peripheral model', () => {
  for (const gpu of ['AMD Radeon RX 6950 XT', 'Intel Arc A770', 'Unknown graphics']) {
    const cards = recommendDrivers({ hardware: hardware(gpu, { peripherals: [{ name: 'EPOMAKER TH80', type: 'Keyboard', connection: 'USB' }] }), board: { manufacturer: '', product: '' }, computer: { manufacturer: '', model: '' }, disks: [], devices: [] });
    assert.doesNotMatch(JSON.stringify(cards), /NVIDIA|Game Ready|EP-84|MS-7C95/);
    assert.ok(cards.some(c => c.category === 'Motherboard' && c.source === null));
  }
});
