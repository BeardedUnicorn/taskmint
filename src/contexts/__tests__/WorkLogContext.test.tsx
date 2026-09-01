/**
 * WorkLogContext tests: shared instance passthrough, staged-capture state,
 * and the capture handler's wiring.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkLogProvider, useWorkLogContext } from '../WorkLogContext';
import { UseWorkLogsReturn } from '../../hooks/useWorkLogs';
import { createMockTask, createMockWorkLogEntry } from '../../__tests__/setup/session-test-utils';

const mockWorkLogs: UseWorkLogsReturn = {
  entries: [createMockWorkLogEntry()],
  mappings: [],
  isLoading: false,
  error: null,
  loadWarning: null,
  reload: vi.fn(),
  applyImport: vi.fn(),
};
vi.mock('../../hooks/useWorkLogs', () => ({
  useWorkLogs: () => mockWorkLogs,
}));

const mockUseWorkLogCapture = vi.fn();
vi.mock('../../hooks/useWorkLogCapture', () => ({
  useWorkLogCapture: (deps: unknown) => mockUseWorkLogCapture(deps),
}));

const mockSessions = [{ id: 'session-1' }];
vi.mock('../SessionManagementContext', () => ({
  useSessionManagementContext: () => ({ sessions: mockSessions }),
}));

const mockUpdateTask = vi.fn();
const mockTasks = [createMockTask()];
vi.mock('../TaskManagementContext', () => ({
  useTaskManagementContext: () => ({ tasks: mockTasks, updateTask: mockUpdateTask }),
}));

function Probe() {
  const context = useWorkLogContext();
  return (
    <div>
      <span data-testid="entry-count">{context.entries.length}</span>
      <span data-testid="staged">{context.stagedCapture?.payloadText ?? 'none'}</span>
      <button
        onClick={() => context.stageCapture({ payloadText: '{"workLogs":[]}', receivedAt: 'T1' })}
      >
        stage
      </button>
      <button onClick={context.clearStagedCapture}>clear</button>
    </div>
  );
}

describe('WorkLogContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shares the work-log instance and manages the staged capture', () => {
    render(
      <WorkLogProvider>
        <Probe />
      </WorkLogProvider>
    );

    expect(screen.getByTestId('entry-count')).toHaveTextContent('1');
    expect(screen.getByTestId('staged')).toHaveTextContent('none');

    fireEvent.click(screen.getByText('stage'));
    expect(screen.getByTestId('staged')).toHaveTextContent('{"workLogs":[]}');

    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('staged')).toHaveTextContent('none');
  });

  it('mounts the capture handler with the shared dependencies', () => {
    render(
      <WorkLogProvider>
        <Probe />
      </WorkLogProvider>
    );

    expect(mockUseWorkLogCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: mockWorkLogs.entries,
        mappings: mockWorkLogs.mappings,
        applyImport: mockWorkLogs.applyImport,
        sessions: mockSessions,
        tasks: mockTasks,
        updateTask: mockUpdateTask,
        stageCapture: expect.any(Function),
      })
    );
  });

  it('throws when used outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(
      'useWorkLogContext must be used within WorkLogProvider'
    );
    consoleError.mockRestore();
  });
});
