import { useState, useEffect, useRef, useCallback } from 'react';

export function useTimer(isRunning: boolean, startTime?: Date) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout>();
  const startTimeRef = useRef<number | null>(null);

  // Memoize the update function to prevent recreating it on every render
  const updateElapsed = useCallback(() => {
    if (startTimeRef.current) {
      const now = Date.now();
      const elapsedMs = now - startTimeRef.current;
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
  }, [isRunning, startTime, updateElapsed]);

  return elapsed;
}
