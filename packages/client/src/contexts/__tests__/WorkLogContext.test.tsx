/**
 * WorkLogContext tests: shared instance passthrough, staged-capture state,
 * and the capture handler's wiring.
 */

import { vi, describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { WorkLogProvider, useWorkLogContext } from '../WorkLogContext';
import { UseWorkLogsReturn } from '../../hooks/useWorkLogs';
import { createMockTask, createMockWorkLogEntry } from '../../__tests__/setup/session-test-utils';

const mockWorkLogs: UseWorkLogsReturn = {
  entries: [createMockWorkLogEntry()],
  mappings: [],
  isLoading: false,
  hasLoaded: true,
  loadWarning: null,
  applyImport: vi.fn(),
  undoImport: vi.fn(),
};
vi.mock('../../hooks/useWorkLogs', () => ({
  useWorkLogs: () => mockWorkLogs,
}));

const mockUseWorkLogCapture = vi.fn();
vi.mock('../../hooks/useWorkLogCapture', () => ({
  useWorkLogCapture: (deps: unknown) => mockUseWorkLogCapture(deps),
}));

const mockSessions = [{ id: 'session-1' }];
const loaded = vi.hoisted(() => ({ sessions: true, tasks: true }));
vi.mock('../SessionManagementContext', () => ({
  useSessionManagementContext: () => ({ sessions: mockSessions, hasLoaded: loaded.sessions }),
}));

const mockTasks = [createMockTask()];
vi.mock('../TaskManagementContext', () => ({
  useTaskManagementContext: () => ({ tasks: mockTasks, hasLoaded: loaded.tasks }),
}));

function Probe() {
  const context = useWorkLogContext();
  return (
    <div>
      <span data-testid="entry-count">{context.entries.length}</span>
      <span data-testid="staged">{context.stagedCapture?.payloadText ?? 'none'}</span>
      <button onClick={context.clearStagedCapture}>clear</button>
    </div>
  );
}

describe('WorkLogContext', () => {
  it('shares the work-log instance and manages the staged capture', () => {
    render(
      <WorkLogProvider>
        <Probe />
      </WorkLogProvider>
    );

    expect(screen.getByTestId('entry-count')).toHaveTextContent('1');
    expect(screen.getByTestId('staged')).toHaveTextContent('none');

    // The capture handler stages a capture it can't apply yet
    const { stageCapture } = mockUseWorkLogCapture.mock.lastCall![0] as {
      stageCapture: (capture: { payloadText: string; receivedAt: string; reason: 'unmapped-project' }) => void;
    };
    act(() => stageCapture({ payloadText: '{"workLogs":[]}', receivedAt: 'T1', reason: 'unmapped-project' }));
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
        undoImport: mockWorkLogs.undoImport,
        sessions: mockSessions,
        tasks: mockTasks,
        stageCapture: expect.any(Function),
        ready: true,
      })
    );
  });

  it('holds captures back until the sessions, the tasks and the work logs have all loaded', () => {
    const ready = () => (mockUseWorkLogCapture.mock.lastCall![0] as { ready: boolean }).ready;
    const mount = () =>
      render(
        <WorkLogProvider>
          <Probe />
        </WorkLogProvider>
      ).unmount();
    try {
      loaded.sessions = false;
      mount();
      expect(ready()).toBe(false);

      loaded.sessions = true;
      loaded.tasks = false;
      mount();
      expect(ready()).toBe(false);

      loaded.tasks = true;
      mockWorkLogs.hasLoaded = false;
      mount();
      expect(ready()).toBe(false);
    } finally {
      loaded.sessions = true;
      loaded.tasks = true;
      mockWorkLogs.hasLoaded = true;
    }
  });

  it('throws when used outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useWorkLogContext must be used within WorkLogProvider');
    consoleError.mockRestore();
  });
});
