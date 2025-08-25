import { createContext, useContext, useState, ReactNode } from 'react';
import { TimerInstance } from '../types/timer';

interface ActiveTimerContextType {
  activeTimer: TimerInstance | null;
  setActiveTimer: (timer: TimerInstance | null) => void;
}

const ActiveTimerContext = createContext<ActiveTimerContextType | undefined>(undefined);

export function ActiveTimerProvider({ children }: { children: ReactNode }) {
  const [activeTimer, setActiveTimer] = useState<TimerInstance | null>(null);
  return (
    <ActiveTimerContext.Provider value={{ activeTimer, setActiveTimer }}>
      {children}
    </ActiveTimerContext.Provider>
  );
}

export function useActiveTimer(): ActiveTimerContextType {
  const context = useContext(ActiveTimerContext);
  if (!context) {
    throw new Error('useActiveTimer must be used within an ActiveTimerProvider');
  }
  return context;
}
