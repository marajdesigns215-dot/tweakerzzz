import { useCallback, useEffect, useRef, useState } from 'react';
import { tweaks } from '../data/tweaks';
import { parseTweakStatus } from './tweak-status';
import type { TweakStatusReport } from '../types';

const supported = tweaks.filter(t => t.mode === 'automatic').map(t => t.id);
export function useTweakStatus() {
  const [report, setReport] = useState<TweakStatusReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; setReport(null); setError(''); setChecking(false); }, []);
  const refresh = useCallback(async () => {
    if (!window.tweaker) return;
    const request = ++generation.current;
    setChecking(true); setReport(null); setError('');
    try {
      const result = parseTweakStatus(await window.tweaker.getTweakStatus(), supported);
      if (generation.current === request) setReport(result);
    } catch (e) {
      if (generation.current === request) setError(String(e));
    } finally { if (generation.current === request) setChecking(false); }
  }, []);
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, [refresh]);
  return { report, checking, error, refresh, invalidate };
}
