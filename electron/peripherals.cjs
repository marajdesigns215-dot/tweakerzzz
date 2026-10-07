'use strict';

// Vendor IDs identify a manufacturer, never the product behind a receiver.
// Epomaker models use several OEM IDs: do not assign that brand from a shared ID.
const vendors = { '046D': 'Logitech', '1B1C': 'Corsair', '1532': 'Razer', '045E': 'Microsoft', '05AC': 'Apple' };
// Small, auditable fallback table from https://github.com/usbids/usbids/blob/master/usb.ids.
// C092 is shared by G102/G203: preserve that ambiguity in the displayed name.
const products = {
  '046D:C084': { type: 'Mouse', name: 'Logitech G203 Gaming Mouse' },
  '046D:C092': { type: 'Mouse', name: 'Logitech G102/G203 LIGHTSYNC Gaming Mouse' },
  '046D:C09D': { type: 'Mouse', name: 'Logitech G102 LIGHTSYNC Gaming Mouse' },
};
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 250) : '';
const idOf = node => clean(node.InstanceId || node.PNPDeviceID).toUpperCase();
const classOf = node => node.Class || node.PNPClass;
const nameOf = node => clean(node.FriendlyName || node.Name);
const usbOf = id => /VID_([A-F0-9]{4}).*?PID_([A-F0-9]{4})/i.exec(id);
const generic = value => {
  const name = clean(value).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return !name || /^(?:\(?standard|microsoft$|unknown|generic|hid[ -]|usb[ -](?:input|composite|audio|hid|video|camera|device|receiver)|bluetooth[ -](?:hid|device|receiver)|\d[.]\d\s*g(?:hz)?\s*(?:wireless\s*)?receiver)/i.test(name)
    || /^(?:(?:usb(?:\s*\d[.]\d)?|wireless|gaming|bluetooth|optical|ergonomic|mechanical|rgb|2[.]4g)\s+)*(?:mouse|keyboard|receiver|headset|headphones|speakers|microphone|camera|webcam|input device|video device)(?:\s+device)?$/i.test(name)
    || /(?:root hub|host controller|composite device|usb hub)/i.test(name);
};
const receiver = name => /\breceiver\b|\bdongle\b/i.test(name);
const productName = (name, type) => {
  const normalized = clean(name);
  // Audio endpoints repeat the product in parentheses; retain the endpoint
  // names separately when grouping its playback and microphone interfaces.
  const audio = type === 'Audio' && /^(?:headset(?: earphone| microphone)?|headphones|speakers|microphone|earphone)(?:\s*\d*)?\s*\((.+)\)$/i.exec(normalized);
  return audio ? audio[1] : normalized;
};

function identifyPeripherals(rows) {
  const nodes = new Map(rows.map(node => [idOf(node), node]).filter(([id]) => id));
  const groups = new Map();
  rows.forEach((device, index) => {
    if (device.Target === false || (device.Status && device.Status !== 'OK')) return;
    if (device.ConfigManagerErrorCode != null && Number(device.ConfigManagerErrorCode) !== 0) return;
    const original = nameOf(device);
    const kind = classOf(device);
    const type = ({ Mouse: 'Mouse', Keyboard: 'Keyboard', AudioEndpoint: 'Audio', Camera: 'Camera' })[kind]
      || (kind === 'Image' && (/camera|webcam|video/i.test(original) || /^usbvideo$/i.test(device.Service || '')) ? 'Camera' : null)
      || (kind === 'HIDClass' && /gamepad|game controller|xbox|dualsense|dualshock/i.test(original) ? 'Controller' : null);
    if (!type) return;

    const chain = [], seen = new Set();
    let node = device;
    for (let depth = 0; node && depth < 5; depth++) {
      const id = idOf(node);
      if (id && seen.has(id)) break;
      seen.add(id); chain.push(node);
      // Never inherit a hub, motherboard, or Bluetooth adapter's name/brand.
      if (/^USB\\VID_/i.test(id) && !/&MI_[A-F0-9]+/i.test(id)) break;
      if (/^BTH(?:ENUM|LEDEVICE)\\/i.test(id)) break;
      const parent = nodes.get(clean(node.Parent).toUpperCase());
      if (parent && (/^(?:PCI|ACPI|ROOT)\\/i.test(idOf(parent)) || /hub|host controller/i.test(nameOf(parent)))) break;
      node = parent;
    }
    const ids = chain.map(idOf);
    const usb = ids.map(usbOf).find(Boolean);
    const usbId = usb ? `${usb[1].toUpperCase()}:${usb[2].toUpperCase()}` : '';
    const namedCandidates = chain.flatMap((item, depth) => [
      { name: productName(item.BusReportedDeviceDesc, type), score: 100 - depth * 5 },
      { name: productName(nameOf(item), type), score: 80 - depth * 5 },
      { name: productName(item.DeviceDesc, type), score: 60 - depth * 5 },
    ]).filter(item => !generic(item.name) && !receiver(item.name)).sort((a, b) => b.score - a.score);
    const reported = namedCandidates[0]?.name;
    const manufacturer = (usb && vendors[usb[1].toUpperCase()])
      || chain.map(item => clean(item.Manufacturer)).find(value => value && !generic(value) && !/^\(?standard|^microsoft|^\(?generic|^unknown/i.test(value))
      || (/\bepomaker\b/i.test(reported || '') ? 'Epomaker' : '');
    const matchedProduct = products[usbId]?.type === type ? products[usbId] : null;
    const identification = reported ? 'reported' : matchedProduct ? 'usb-id' : manufacturer ? 'vendor-only' : 'generic';
    const name = reported || matchedProduct?.name || (manufacturer ? `${manufacturer} ${type.toLowerCase()} (model not reported)` : original || `Unidentified ${type.toLowerCase()}`);
    const connection = ids.some(id => /^BTH/i.test(id)) ? 'Bluetooth'
      : ids.some(id => /^USB\\/i.test(id)) ? (chain.some(item => receiver(nameOf(item)) || receiver(clean(item.BusReportedDeviceDesc))) ? 'USB receiver' : 'USB')
      : ids.some(id => /^HID\\/i.test(id)) ? 'HID' : 'System';
    const container = chain.map(item => clean(item.ContainerId)).find(value => /^\{?[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\}?$/i.test(value) && !/^\{?0{8}-0{4}-0{4}-0{4}-0{12}\}?$/.test(value));
    const physical = ids.find(id => /^USB\\VID_/i.test(id) && !/&MI_/i.test(id)) || container || idOf(device) || `row:${index}`;
    // Shared receivers can host multiple products. Only combine matching
    // reported names and roles within the same physical device/container.
    const key = `${physical.toUpperCase()}|${type}|${name.toUpperCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.interfaceCount++;
      if (original && !existing.interfaces.includes(original)) existing.interfaces.push(original);
    } else {
      groups.set(key, { name, type, connection, identification, ...(manufacturer ? { manufacturer } : {}), ...(usbId ? { usbId } : {}), interfaceCount: 1, interfaces: original ? [original] : [] });
    }
  });
  // No serials, instance IDs, container GUIDs, addresses, or parent paths leave
  // this boundary. A VID:PID identifies a product family, not a specific unit.
  return [...groups.values()].map(item => ({ ...item, interfaces: item.interfaces.slice(0, 30) })).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { identifyPeripherals };
