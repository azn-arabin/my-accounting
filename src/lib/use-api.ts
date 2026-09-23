'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

// ---- Global in-flight request counter (drives the loading bar in the header)

let pending = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function trackRequest<T>(promise: Promise<T>): Promise<T> {
  pending++;
  emit();
  return promise.finally(() => {
    pending--;
    emit();
  });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** True while any request started through `useApi`/`apiFetch` is running. */
export function useIsFetching() {
  return useSyncExternalStore(subscribe, () => pending > 0, () => false);
}

/** fetch + JSON + error message from the API's `{ error }` body. Counted by the loading bar. */
export function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  return trackRequest(
    fetch(url, init).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
      return body as T;
    }),
  );
}

/**
 * GET `url` whenever it changes. Keeps the previous data while the next request runs, so pages can
 * dim instead of flashing a skeleton:
 * - `loading`: nothing loaded yet (show a skeleton)
 * - `refreshing`: showing older data while newer data loads (dim it)
 */
export function useApi<T>(url: string | null) {
  const [nonce, setNonce] = useState(0);
  const key = url ? `${url}#${nonce}` : null;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);

  useEffect(() => {
    if (!url || !key) return;
    const controller = new AbortController();
    apiFetch<T>(url, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setResult((prev) => ({ key, data: prev?.data, error: e instanceof Error ? e.message : 'Request failed' }));
      });
    return () => controller.abort();
  }, [url, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data: result?.data,
    error: result?.error,
    loading: !result,
    refreshing: !!result && result.key !== key,
    reload,
  };
}
