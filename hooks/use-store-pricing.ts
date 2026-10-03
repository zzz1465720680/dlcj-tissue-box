'use client';
import {useEffect, useState} from 'react';
import {frontendPreview} from '@/lib/frontend-preview';
import {INITIAL_PRICING, type StorePricing} from '@/lib/pricing';
import {readStorePricing} from '@/lib/store-client';

/** Prices are read from the API on mount/focus; never persisted in browser storage. */
export function useStorePricing(enabled = true) {
  const [state, setState] = useState<{pricing: StorePricing | null; error: unknown; loading: boolean; changed: boolean}>({
    pricing: frontendPreview ? INITIAL_PRICING : null, error: null, loading: !frontendPreview, changed: false,
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (frontendPreview || !enabled) return;
    const controller = new AbortController(); let sequence = 0;
    const load = async () => {
      const attempt = ++sequence;
      try {
        const pricing = await readStorePricing(controller.signal);
        if (!controller.signal.aborted && attempt === sequence) setState(current => ({pricing, error: null, loading: false, changed: current.changed || Boolean(current.pricing && current.pricing.version !== pricing.version)}));
      } catch (error) {
        if (!controller.signal.aborted && attempt === sequence) setState(current => ({pricing: null, error, loading: false, changed: current.changed}));
      }
    };
    void load(); window.addEventListener('focus', load);
    return () => {controller.abort(); window.removeEventListener('focus', load);};
  }, [revision, enabled]);
  return {...state, preview: frontendPreview, reload: () => setRevision(value => value + 1)};
}
