import { useState } from 'react';
import { AudioLines, Camera, Download, Gamepad2, Keyboard, Mouse } from 'lucide-react';
import type { Peripheral } from '../types';

export function PeripheralDevices({ devices, onSelect, onExport }: { devices: Peripheral[]; onSelect: (device: Peripheral) => void; onExport: () => void }) {
  const [showGeneric, setShowGeneric] = useState(false);
  if (!devices.length) return null;
  const genericCount = devices.filter(device => device.identification === 'generic').length;
  const visible = devices.filter(device => showGeneric || device.identification !== 'generic');
  return <section className="peripheral-results" aria-label="Detected peripherals">
    <div className="device-toolbar">
      <div><strong>Your connected devices</strong><p>Product names come from Windows and USB descriptors. A receiver may hide the exact model.</p></div>
      <div className="button-row">
        {genericCount > 0 && <button className="button secondary compact" aria-pressed={showGeneric} onClick={() => setShowGeneric(value => !value)}>{showGeneric ? 'Hide' : 'Show'} generic Windows entries ({genericCount})</button>}
        <button className="button secondary compact" onClick={onExport}><Download size={15}/>Export device report</button>
      </div>
    </div>
    {!visible.length && <p className="body-copy unresolved-devices">Windows reported only generic entries. Show them for details; connecting a keyboard by cable can expose its product name.</p>}
    <div className="device-list">{visible.map((device, index) => {
      const Icon = ({ Mouse, Keyboard, Audio: AudioLines, Controller: Gamepad2, Camera, Other: Mouse })[device.type];
      return <button className="device-card" key={index} onClick={() => onSelect(device)}>
        <Icon size={24}/><div><strong>{device.name}</strong><small>{device.type} · {device.connection}</small>
          <span className={`device-identification ${['reported', 'usb-id'].includes(device.identification ?? '') ? 'reported' : ''}`}>{device.identification === 'reported' ? 'Product name reported' : device.identification === 'usb-id' ? 'Recognized USB product ID' : device.identification === 'vendor-only' ? 'Brand identified · model unavailable' : device.identification === 'generic' ? 'Generic Windows entry · model unavailable' : 'Windows device name'}</span>
          {device.usbId && <small className="device-usb">USB product {device.usbId}</small>}
          {(device.interfaceCount ?? 0) > 1 && <small title={device.interfaces?.join('\n')}>{device.interfaceCount} Windows interfaces grouped</small>}
        </div>
      </button>;
    })}</div>
  </section>;
}
