/**
 * Work-Log Context
 *
 * Owns the single shared useWorkLogs instance (ledger + mappings + apply) so
 * the Payouts page and the browser-capture handler see the same data, plus
 * the "staged capture" a delivered payload waits in when a project has no
 * task match. Also mounts the capture handler itself.
 *
 * Must sit inside SessionManagementProvider and TaskManagementProvider — the
 * capture handler builds rewrite groups from sessions and syncs task rates.
 */

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { useWorkLogs, UseWorkLogsReturn } from '../hooks/useWorkLogs';
import { useWorkLogCapture, StagedCapture } from '../hooks/useWorkLogCapture';
import { useSessionManagementContext } from './SessionManagementContext';
import { useTaskManagementContext } from './TaskManagementContext';

export interface WorkLogContextValue extends UseWorkLogsReturn {
  stagedCapture: StagedCapture | null;
  stageCapture: (capture: StagedCapture) => void;
  clearStagedCapture: () => void;
}

const WorkLogContext = createContext<WorkLogContextValue | null>(null);

export function WorkLogProvider({ children }: { children: ReactNode }) {
  const workLogs = useWorkLogs();
  const { sessions } = useSessionManagementContext();
  const { tasks, updateTask } = useTaskManagementContext();

  const [stagedCapture, setStagedCapture] = useState<StagedCapture | null>(null);
  const stageCapture = useCallback((capture: StagedCapture) => {
    setStagedCapture(capture);
  }, []);
  const clearStagedCapture = useCallback(() => {
    setStagedCapture(null);
  }, []);

  useWorkLogCapture({
    entries: workLogs.entries,
    mappings: workLogs.mappings,
    applyImport: workLogs.applyImport,
    sessions,
    tasks,
    updateTask,
    stagedCapture,
    stageCapture,
    clearStagedCapture,
  });

  return (
    <WorkLogContext.Provider
      value={{ ...workLogs, stagedCapture, stageCapture, clearStagedCapture }}
    >
      {children}
    </WorkLogContext.Provider>
  );
}

export function useWorkLogContext(): WorkLogContextValue {
  const context = useContext(WorkLogContext);
  if (!context) {
    throw new Error('useWorkLogContext must be used within WorkLogProvider');
  }
  return context;
}
