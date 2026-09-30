import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { apiError, ApiErrorInfo } from '@/api/client';

/** Loads data with loading / error state and a reload function */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList, opts: { skip?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!opts.skip);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const seq = useRef(0);
  const run = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const r = await fn();
      if (id === seq.current) setData(r);
    } catch (e) {
      if (id === seq.current) setError(apiError(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    if (!opts.skip) void run();
  }, [run, opts.skip]);
  return { data, setData, loading, error, reload: run };
}

export function useDebounce<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useHotkey(combo: (e: KeyboardEvent) => boolean, handler: (e: KeyboardEvent) => void, deps: DependencyList = []) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (combo(e)) handler(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const isTyping = (e: Event) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};
