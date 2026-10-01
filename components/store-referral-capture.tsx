'use client';

import {useEffect} from 'react';
import {captureReferralFromUrl} from '@/lib/store-client';

// The framework build needs the same landing-page capture as the static entry.
// Preview builds remain disabled by the shared client guard.
export default function StoreReferralCapture() {
  useEffect(() => { void captureReferralFromUrl(); }, []);
  return null;
}
