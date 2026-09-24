'use client';

import {useEffect, useState} from 'react';
import {NOTE_MAX} from '@/lib/purchase';

const KEY = 'dlcj-inquiry-v1';
export type InquiryInput = {quantity: string; note: string; lastCopiedKey: string};
const empty: InquiryInput = {quantity: '1', note: '', lastCopiedKey: ''};

// Kept separately from the version-1 design, so existing design files remain compatible.
export function useInquiryDraft() {
  const [input, setInput] = useState<InquiryInput>(empty);
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (raw && typeof raw === 'object') {
        const value = raw as Record<string, unknown>;
        if (typeof value.quantity === 'string' && value.quantity.length <= 32 &&
            typeof value.note === 'string' && value.note.length <= NOTE_MAX) {
          setInput({quantity: value.quantity, note: value.note,
            lastCopiedKey: typeof value.lastCopiedKey === 'string' && /^[A-F0-9]{16}$/.test(value.lastCopiedKey) ? value.lastCopiedKey : ''});
        }
      }
    } catch { setStorageFailed(true); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(input)); setStorageFailed(false); }
    catch { setStorageFailed(true); }
  }, [input, ready]);
  return {input, setInput, ready, storageFailed};
}
