import { useCallback, useRef } from 'react';

interface DebouncedSaveOptions {
  delay?: number;
  immediate?: boolean;
}

/**
 * Hook for debounced data persistence to reduce frequent database writes
 * @param saveFunction - The function to call for saving data
 * @param options - Configuration options
 * @returns Debounced save function
 */
export function useDebouncedSave<T extends any[]>(
  saveFunction: (...args: T) => Promise<void> | void,
  options: DebouncedSaveOptions = {}
) {
  const { delay = 1000, immediate = false } = options;
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastCallRef = useRef<T>();

  const debouncedSave = useCallback(
    (...args: T) => {
      lastCallRef.current = args;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // If immediate is true, call immediately on first invocation
      if (immediate && !timeoutRef.current) {
        saveFunction(...args);
        return;
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        if (lastCallRef.current) {
          saveFunction(...lastCallRef.current);
        }
        timeoutRef.current = undefined;
      }, delay);
    },
    [saveFunction, delay, immediate]
  );

  // Force immediate save (useful for component unmount)
  const flushSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      if (lastCallRef.current) {
        saveFunction(...lastCallRef.current);
      }
      timeoutRef.current = undefined;
    }
  }, [saveFunction]);

  // Cancel pending save
  const cancelSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  return {
    debouncedSave,
    flushSave,
    cancelSave,
    isPending: !!timeoutRef.current,
  };
}

/**
 * Hook specifically for session data persistence
 */
export function useSessionDebouncedSave() {
  const saveSessionData = useCallback(async (sessionData: any) => {
    try {
      // This would typically call a Tauri command to save session data
      console.log('Saving session data:', sessionData);
      // await invoke('save_session_data', { sessionData });
    } catch (error) {
      console.error('Failed to save session data:', error);
    }
  }, []);

  return useDebouncedSave(saveSessionData, { delay: 2000 });
}

/**
 * Hook specifically for timer state persistence
 */
export function useTimerStateDebouncedSave() {
  const saveTimerState = useCallback(async (timerState: any) => {
    try {
      // This would typically call a Tauri command to save timer state
      console.log('Saving timer state:', timerState);
      // await invoke('save_timer_state', { timerState });
    } catch (error) {
      console.error('Failed to save timer state:', error);
    }
  }, []);

  return useDebouncedSave(saveTimerState, { delay: 500 });
}
