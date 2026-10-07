import { ArrowRight, ArrowUpRight, AudioLines, Camera, Download, Gamepad2, Keyboard, Mouse } from 'lucide-react';
import type { Peripheral } from '../types';
import { peripheralGuide } from '../lib/peripheral-guides';

export function PeripheralGuidance({ device, category, onCategory, onSettings, onTweaks }: {
  device: Peripheral | null; category: string; onCategory: (category: string) => void;
  onSettings: (target: string) => void; onTweaks: () => void;
}) {
  const guide = peripheralGuide(device, category);
  const Icon = ({ Mouse, Keyboard, Audio: AudioLines, Controller: Gamepad2, Camera })[category] ?? Mouse;
  const exportGuide = () => {
    const text = `TWEAKERZZZ / PERIPHERAL SETTINGS GUIDE\nDevice: ${device?.name ?? category}\nProfile: ${guide.profile}\n${guide.basis}\n\n${guide.steps.map((item, index) => `${index + 1}. ${item.title}\n${item.detail}`).join('\n\n')}\n\nSuggestions to review manually. Current DPI, polling rate, firmware, and camera modes were not measured. Compare the same game and recording scene before and after each change.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tweakerzzz-peripheral-guide.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <div className="tabs peripheral-tabs">{['Mouse', 'Keyboard', 'Audio', 'Controller', 'Camera'].map(type => <button key={type} className={type === category ? 'active' : ''} onClick={() => onCategory(type)}>{type}</button>)}</div>
    <div className="two-columns"><section className="panel peripheral-guide">
      <div className="section-heading"><div><span className="eyebrow">{device ? 'SELECTED DEVICE' : 'CATEGORY GUIDE'}</span><h2>{device ? guide.profile : `${category} setup guide`}</h2></div></div>
      {device && <p className="guide-device-name">{device.name} · {device.connection}</p>}
      <p className="body-copy guide-basis">{guide.basis} Suggestions are manual; current device settings have not been measured.</p>
      {guide.steps.map((item, index) => <div className="numbered-insight" key={item.title}><span>0{index + 1}</span><div><h3>{item.title}</h3><p>{item.detail}</p></div></div>)}
      <div className="button-row"><button className="button secondary" onClick={() => onSettings(({ Audio: 'sound', Mouse: 'mouse', Keyboard: 'keyboard', Camera: 'camera' })[category] ?? 'gaming')}>Open related Windows settings<ArrowUpRight size={14}/></button><button className="button secondary" onClick={exportGuide}><Download size={15}/>Export device settings guide</button></div>
    </section><section className="panel"><div className="section-heading"><h2>A setup that feels like you</h2></div><div className="peripheral-art"><Icon strokeWidth={1} size={126}/><span className="pulse-ring"/></div><h3>Measure. Adjust. Play.</h3><p className="body-copy">Select a device above to see its matching recommendations. Unknown models receive category guidance. Compare input behavior, game frame times, and OBS Stats after each change.</p><button className="text-button" onClick={onTweaks}>Explore peripheral tweaks<ArrowRight size={15}/></button></section></div>
  </>;
}
