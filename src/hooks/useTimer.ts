import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Ticking elapsed-time hook for a running timer.
 *
 * `pausedOffsetMs` is the timer's accumulated pause time (pausedDuration);
 * subtracting it keeps the live display consistent with the duration the
 * backend records at stop.
 */
export function useTimer(isRunning: boolean, startTime?: Date, pausedOffsetMs: number = 0) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout>();
  const startTimeRef = useRef<number | null>(null);
  const offsetRef = useRef(pausedOffsetMs);
  offsetRef.current = pausedOffsetMs;

  // Memoize the update function to prevent recreating it on every render
  const updateElapsed = useCallback(() => {
    if (startTimeRef.current) {
      const now = Date.now();
      const elapsedMs = now - startTimeRef.current - offsetRef.current;
      setElapsed(Math.max(0, elapsedMs));
    }
  }, []);

  useEffect(() => {
    if (isRunning && startTime && startTime instanceof Date && !isNaN(startTime.getTime())) {
      startTimeRef.current = startTime.getTime();

      // Update immediately
      updateElapsed();

      // Then update every second
      intervalRef.current = setInterval(updateElapsed, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
      startTimeRef.current = null;
      setElapsed(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, [isRunning, startTime, pausedOffsetMs, updateElapsed]);

  return elapsed;
}
