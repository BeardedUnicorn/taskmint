import { useState, useEffect, useRef } from 'react';

export function useTimer(isRunning: boolean, startTime?: Date) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    console.log(`useTimer: isRunning=${isRunning}, startTime=${startTime}`);
    if (isRunning && startTime && startTime instanceof Date && !isNaN(startTime.getTime())) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const start = startTime.getTime();
        const elapsedMs = now - start;

        // Ensure elapsed time is never negative or NaN
        setElapsed(Math.max(0, elapsedMs));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // Reset elapsed time to 0 when timer is not running or startTime is invalid
      setElapsed(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, startTime]);

  return elapsed;
}
