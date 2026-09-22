import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '../api/client';

export interface ApiResource<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

// The outcome of one request, tagged with the key and reload count it answered.
interface Settled<T> {
  key: string;
  version: number;
  data: T | null;
  error: Error | null;
}

/**
 * Fetches on mount and whenever `key` changes; `reload` refetches in place.
 * `key` must identify everything `fetcher` depends on. Data from a previous
 * key is never returned, but data is kept while the same key reloads, so
 * polling and retries don't blank the screen. `loading` and `error` are
 * derived from whether the settled result matches the current request.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, key: string): ApiResource<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((count) => count + 1), []);

  // Callers pass inline functions; keeping the latest in a ref lets the fetch
  // effect depend on `key` alone.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    const controller = new AbortController();

    // A superseded request is ignored even if its fetcher doesn't honour the
    // signal, so a slow old response can never overwrite a newer one.
    fetcherRef.current(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setSettled({ key, version, data, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setSettled((previous) => ({
          key,
          version,
          data: previous?.key === key ? previous.data : null,
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      },
    );

    return () => controller.abort();
  }, [key, version]);

  const sameKey = settled !== null && settled.key === key;
  const current = sameKey && settled.version === version;

  return {
    data: sameKey ? settled.data : null,
    error: current ? settled.error : null,
    loading: !current,
    reload,
  };
}
