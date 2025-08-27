import { createContext, useContext, ReactNode } from 'react';
import { useTaskManagement } from '../hooks/useTaskManagement';
import { UseTaskManagementReturn } from '../types/task';

const TaskManagementContext = createContext<UseTaskManagementReturn | undefined>(undefined);

export function TaskManagementProvider({ children }: { children: ReactNode }) {
  const taskManagement = useTaskManagement();
  return (
    <TaskManagementContext.Provider value={taskManagement}>
      {children}
    </TaskManagementContext.Provider>
  );
}

export function useTaskManagementContext(): UseTaskManagementReturn {
  const context = useContext(TaskManagementContext);
  if (!context) {
    throw new Error('useTaskManagementContext must be used within a TaskManagementProvider');
  }
  return context;
}
