const test = require('node:test');
const assert = require('node:assert/strict');
const { identifyPeripherals } = require('../electron/peripherals.cjs');
const node = (id, kind, name, extra = {}) => ({ InstanceId: id, Class: kind, FriendlyName: name, Status: 'OK', ...extra });

test('USB product IDs identify a generic G203 and preserve shared G102/G203 identity', () => {
  const result = identifyPeripherals([
    node('HID\\VID_046D&PID_C084\\private-a', 'Mouse', 'HID-compliant mouse'),
    node('HID\\VID_046D&PID_C092\\private-b', 'Mouse', 'HID-compliant mouse'),
  ]);
  assert.equal(result.length, 2);
  assert.ok(result.some(item => item.name === 'Logitech G203 Gaming Mouse'));
  assert.ok(result.some(item => item.name.includes('G102/G203 LIGHTSYNC')));
  assert.ok(result.every(item => item.identification === 'usb-id'));
  assert.ok(!JSON.stringify(result).includes('private-'));
});

test('generic keyboard interfaces inherit an EP-84 product descriptor from their USB parent', () => {
  const parent = 'USB\\VID_1234&PID_5678\\private-keyboard'; // Synthetic IDs, not an EP-84 lookup.
  const result = identifyPeripherals([
    node('HID\\VID_1234&PID_5678&COL01\\private-1', 'Keyboard', 'HID Keyboard Device', { Parent: parent }),
    node('HID\\VID_1234&PID_5678&COL02\\private-2', 'Keyboard', 'HID Keyboard Device', { Parent: parent }),
    node(parent, 'USB', 'USB Composite Device', { Target: false, BusReportedDeviceDesc: 'EPOMAKER EP-84', Manufacturer: 'EPOMAKER' }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'EPOMAKER EP-84');
  assert.equal(result[0].type, 'Keyboard');
  assert.equal(result[0].connection, 'USB');
  assert.equal(result[0].interfaceCount, 2);
  assert.equal(result[0].identification, 'reported');
  assert.ok(!JSON.stringify(result).includes('private-'));
});

test('a receiver identifies only its vendor and never guesses the connected mouse model', () => {
  const parent = 'USB\\VID_046D&PID_C52B\\private-receiver';
  const result = identifyPeripherals([
    node('HID\\VID_046D&PID_C52B\\private-child', 'Mouse', 'HID-compliant mouse', { Parent: parent }),
    node(parent, 'USB', 'USB Receiver', { Target: false, BusReportedDeviceDesc: 'Logitech USB Receiver' }),
  ]);
  assert.equal(result[0].name, 'Logitech mouse (model not reported)');
  assert.equal(result[0].identification, 'vendor-only');
  assert.equal(result[0].connection, 'USB receiver');
});

test('unknown OEM keyboard IDs do not become Epomaker and never inherit USB hub names', () => {
  const result = identifyPeripherals([
    node('HID\\VID_1234&PID_9876\\private-keyboard', 'Keyboard', 'HID Keyboard Device', { Parent: 'USB\\HUB\\private-hub' }),
    node('USB\\HUB\\private-hub', 'USB', 'Example USB Hub', { Target: false, Manufacturer: 'Unrelated hub manufacturer' }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].identification, 'generic');
  assert.equal(result[0].manufacturer, undefined);
  assert.doesNotMatch(result[0].name, /Epomaker|hub/i);
});

test('headset playback and microphone group by matching product and physical container', () => {
  const container = '11111111-2222-3333-4444-555555555555';
  const result = identifyPeripherals([
    node('SWD\\MMDEVAPI\\private-out', 'AudioEndpoint', 'Headset Earphone (CORSAIR VOID ELITE Wireless Gaming Headset)', { ContainerId: container }),
    node('SWD\\MMDEVAPI\\private-in', 'AudioEndpoint', 'Headset Microphone (CORSAIR VOID ELITE Wireless Gaming Headset)', { ContainerId: container }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'CORSAIR VOID ELITE Wireless Gaming Headset');
  assert.equal(result[0].interfaceCount, 2);
  assert.equal(result[0].interfaces.length, 2);
  assert.ok(!JSON.stringify(result).includes(container));
});

test('identical products on different physical devices stay separate and cameras are included', () => {
  const result = identifyPeripherals([
    node('USB\\VID_046D&PID_C084\\private-one', 'Mouse', 'HID-compliant mouse'),
    node('USB\\VID_046D&PID_C084\\private-two', 'Mouse', 'HID-compliant mouse'),
    node('USB\\VID_1234&PID_5678\\private-camera', 'Camera', '1080P Pro Stream'),
    node('USB\\private-scanner', 'Image', 'Office document scanner'),
    node('USB\\private-offline', 'Mouse', 'Disconnected mouse', { ConfigManagerErrorCode: 45 }),
  ]);
  assert.equal(result.filter(item => item.type === 'Mouse').length, 2);
  assert.equal(result.filter(item => item.type === 'Camera').length, 1);
  assert.equal(result.length, 3);
});

test('Bluetooth ancestry does not mislabel a device as the adapter', () => {
  const parent = 'BTHENUM\\private-device';
  const result = identifyPeripherals([
    node('HID\\private-child', 'Keyboard', 'HID Keyboard Device', { Parent: parent }),
    node(parent, 'Bluetooth', 'Tester keyboard', { Target: false, Parent: 'USB\\adapter' }),
    node('USB\\adapter', 'USB', 'Wireless USB adapter', { Target: false, Manufacturer: 'Adapter company' }),
  ]);
  assert.equal(result[0].name, 'Tester keyboard');
  assert.equal(result[0].connection, 'Bluetooth');
  assert.equal(result[0].manufacturer, undefined);
});

test('legacy imaging-class webcams are recognized by their video driver while generic camera names stay unresolved', () => {
  const result = identifyPeripherals([
    node('USB\\private-legacy-camera', 'Image', '1080P Pro Stream', { Service: 'usbvideo' }),
    node('USB\\private-generic-camera', 'Camera', 'USB Video Device'),
  ]);
  assert.equal(result.length, 2);
  assert.ok(result.every(item => item.type === 'Camera'));
  assert.equal(result.find(item => item.name === 'USB Video Device').identification, 'generic');
});

test('device reports preserve identification evidence and reject invalid metadata', async () => {
  const { parsePeripheralReport } = await import('../src/lib/reports.ts');
  const result = { peripherals: identifyPeripherals([node('USB\\VID_046D&PID_C084\\private', 'Mouse', 'HID-compliant mouse')]), scannedAt: new Date().toISOString(), warnings: [] };
  assert.deepEqual(parsePeripheralReport(result), result);
  for (const change of [{ identification: 'certain' }, { usbId: 'serial123' }, { interfaceCount: -1 }, { interfaces: [null] }]) {
    assert.throws(() => parsePeripheralReport({ ...result, peripherals: [{ ...result.peripherals[0], ...change }] }));
  }
});

test('recommendations follow each tester’s evidence without assigning unknown-model capabilities', async () => {
  const { peripheralGuide } = await import('../src/lib/peripheral-guides.ts');
  const mouse = { name: 'Logitech G203 Gaming Mouse', type: 'Mouse', connection: 'USB', identification: 'usb-id', usbId: '046D:C084' };
  assert.match(peripheralGuide(mouse, 'Keyboard').profile, /G203/);
  assert.match(peripheralGuide(mouse, 'Mouse').steps[0].detail, /1,000 Hz/);
  const keyboard = { name: 'EPOMAKER EP-84', type: 'Keyboard', connection: 'USB', identification: 'reported' };
  assert.equal(peripheralGuide(keyboard, 'Mouse').profile, 'Epomaker EP-84');
  const unknown = { name: 'HID Keyboard Device', type: 'Keyboard', connection: 'HID', identification: 'generic' };
  assert.equal(peripheralGuide(unknown, 'Mouse').profile, 'Keyboard starting settings');
  assert.doesNotMatch(JSON.stringify(peripheralGuide(unknown, 'Mouse')), /EP-84|G203/);
  const webcam = peripheralGuide({ name: '1080P Pro Stream', type: 'Camera', connection: 'USB', identification: 'reported' }, 'Mouse');
  assert.equal(webcam.profile, 'Camera starting settings');
  assert.match(webcam.steps[0].detail, /does not establish 60 FPS support/);
  const voidGuide = peripheralGuide({ name: 'CORSAIR VOID ELITE Wireless Gaming Headset', type: 'Audio', connection: 'USB', identification: 'reported' }, 'Mouse');
  assert.equal(voidGuide.profile, 'Corsair VOID headset');
});
