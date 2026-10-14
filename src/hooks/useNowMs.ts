import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `intervalMs` while `active` (e.g. while a
 * timer runs), and once whenever `active`, the interval or `refreshOn`
 * changes, so live totals tick only when something is actually moving.
 */
export function useNowMs(active: boolean, intervalMs: number, refreshOn?: unknown): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
    if (!active) return;
    const interval = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [active, intervalMs, refreshOn]);
  return nowMs;
}
