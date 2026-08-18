/**
 * Session Management Context
 *
 * Provides a single shared useSessionManagement() instance to the whole app.
 * Session state lives in React state inside that hook, so every consumer must
 * read the same instance — separate instances would each hold their own
 * diverging copy of the session list (stale tray, stale reports, etc.).
 */

import { createContext, useContext, ReactNode } from 'react';
import { useSessionManagement } from '../hooks/useSessionManagement';
import { UseSessionManagementReturn } from '../types/timer';

const SessionManagementContext = createContext<UseSessionManagementReturn | null>(null);

export function SessionManagementProvider({ children }: { children: ReactNode }) {
  const value = useSessionManagement();
  return (
    <SessionManagementContext.Provider value={value}>
      {children}
    </SessionManagementContext.Provider>
  );
}

export function useSessionManagementContext(): UseSessionManagementReturn {
  const context = useContext(SessionManagementContext);
  if (!context) {
    throw new Error('useSessionManagementContext must be used within SessionManagementProvider');
  }
  return context;
}
