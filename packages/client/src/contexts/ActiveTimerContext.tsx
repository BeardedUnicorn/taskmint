import { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { TimerInstance } from '../types/timer';

interface ActiveTimerContextType {
  activeTimer: TimerInstance | null;
  setActiveTimer: (timer: TimerInstance | null) => void;
}

const ActiveTimerContext = createContext<ActiveTimerContextType | undefined>(undefined);

export function ActiveTimerProvider({ children }: { children: ReactNode }) {
  const [activeTimer, setActiveTimer] = useState<TimerInstance | null>(null);
  const value = useMemo(() => ({ activeTimer, setActiveTimer }), [activeTimer]);
  return <ActiveTimerContext.Provider value={value}>{children}</ActiveTimerContext.Provider>;
}

export function useActiveTimer(): ActiveTimerContextType {
  const context = useContext(ActiveTimerContext);
  if (!context) {
    throw new Error('useActiveTimer must be used within an ActiveTimerProvider');
  }
  return context;
}
