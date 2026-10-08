import { tweaks } from '../data/tweaks.ts';
import type { SystemScan } from '../types.ts';
import { displayGuidance, gpuCapabilities, memoryGuidance } from './hardware-guidance.ts';

export function tweaksForHardware(hardware: SystemScan | null) {
  const gpu = gpuCapabilities(hardware), display = displayGuidance(hardware);
  const requirements: Record<string, boolean> = {
    'nvidia-reflex': gpu.nvenc, 'nvidia-low-latency': gpu.vendor === 'nvidia', 'nvidia-power-game': gpu.vendor === 'nvidia',
    'dlss-quality': gpu.rtx, 'frame-generation': gpu.newerRtx,
    'obs-nvenc-h264': gpu.nvenc, 'obs-nvenc-av1': gpu.nvenc && gpu.av1,
    'obs-lookahead': gpu.nvenc,
    'obs-hardware-h264': gpu.h264 && !gpu.nvenc, 'obs-hardware-av1': gpu.av1 && !gpu.nvenc,
  };
  return tweaks.filter(t => !(t.id in requirements) || requirements[t.id]).map(t => {
    if (t.id === 'memory-profile') return { ...t, details: memoryGuidance(hardware) };
    if (t.id === 'vram-budget') return { ...t, details: `${hardware?.gpu.vramGB != null ? `The scan reports ${hardware.gpu.vramGB} GB dedicated VRAM on ${hardware.gpu.name}.` : 'Dedicated VRAM capacity was not reported; check the GPU utility before choosing a texture budget.'} ${t.details}` };
    if (t.id === 'vibrance-profile') return { ...t, steps: [display.color, ...t.steps!.slice(1)] };
    if (t.id === 'rgb-range') return { ...t, steps: [t.steps![0], display.range, ...t.steps!.slice(2)] };
    if (t.id === 'stretched-resolution') return { ...t, steps: [t.steps![0], display.scaling, ...t.steps!.slice(2)] };
    if (t.id === 'vrr-setup') return { ...t, steps: [t.steps![0], display.vrr, ...t.steps!.slice(2)] };
    if (t.id === 'obs-hardware-h264' || t.id === 'obs-hardware-av1') return { ...t, title: `Test ${gpu.encoder} ${t.id.endsWith('av1') ? 'AV1' : 'H.264'} encoding`, details: `${gpu.name}: check that OBS lists this encoder. ${t.details}` };
    return t;
  });
}
