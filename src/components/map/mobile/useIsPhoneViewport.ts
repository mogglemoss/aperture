'use client';

import { useSyncExternalStore } from 'react';
import { PANEL_BREAKPOINTS } from '@/lib/map/layout/panels';

// Phone-width test for the mobile chain view (nomadic-chains). Keys off the
// same breakpoint table the dashboard grid uses (`PANEL_BREAKPOINTS`), but
// reads the *window* width via matchMedia rather than the grid's reported
// breakpoint: the mobile view unmounts the grid entirely, so the render
// decision must precede — and outlive — the grid's own measurement. (The grid
// measures its container, which is a few px narrower than the window; at phone
// scale the two always agree on `sm`.)
const PHONE_VIEWPORT_QUERY = `(max-width: ${PANEL_BREAKPOINTS.md - 1}px)`;

function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(PHONE_VIEWPORT_QUERY);
  mql.addEventListener('change', onStoreChange);
  return () => mql.removeEventListener('change', onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(PHONE_VIEWPORT_QUERY).matches;
}

// SSR renders desktop (false); the client store corrects on first render
// without a hydration mismatch (useSyncExternalStore semantics).
export function useIsPhoneViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
