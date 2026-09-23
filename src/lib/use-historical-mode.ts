'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { parseHistoricalMode, type HistoricalMode } from '@/lib/historical';

const STORAGE_KEY = 'ka-historical-mode';
const listeners = new Set<() => void>();
let fallback: HistoricalMode = 'include'; // used when storage is unavailable

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): HistoricalMode {
  try {
    return parseHistoricalMode(localStorage.getItem(STORAGE_KEY) ?? fallback);
  } catch {
    return fallback;
  }
}

/** The historical-data filter, shared by every page and remembered in this browser. */
export function useHistoricalMode() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => 'include' as const);

  const setMode = useCallback((next: HistoricalMode) => {
    fallback = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable: the choice lasts until reload
    }
    listeners.forEach(l => l());
  }, []);

  return { mode, setMode };
}
