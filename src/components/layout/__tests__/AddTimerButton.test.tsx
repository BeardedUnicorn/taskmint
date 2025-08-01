/**
 * Tests for Add Timer button functionality in SessionTimerBar component
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { SessionTimerBar } from '../SessionTimerBar';
import type { TaskSession, TimerInstance } from '../../../types/timer';

vi.mock('../../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
  }),
}));

describe('Add Timer button', () => {
  it('creates a new timer instance when clicked', () => {
    const timer: TimerInstance = {
      id: 'instance-1',
      sessionId: 'session-1',
      startTime: new Date(),
      endTime: undefined,
      duration: 0,
      isRunning: true,
      isPaused: false,
      pausedAt: undefined,
      pausedDuration: undefined,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const session: TaskSession = {
      id: 'session-1',
      taskId: 'task-1',
      taskName: 'Test Task',
      timerInstances: [timer],
      totalDuration: 0,
      isActive: true,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const onCreateTimerInstance = vi.fn();

    render(
      <SessionTimerBar
        activeSession={session}
        predefinedTasks={[]}
        onStartSession={vi.fn()}
        onEndSession={vi.fn()}
        onPauseAll={vi.fn()}
        onResumeAll={vi.fn()}
        onCreateTimerInstance={onCreateTimerInstance}
        onStartTimer={vi.fn()}
        onStopTimer={vi.fn()}
        onPauseTimer={vi.fn()}
        onResumeTimer={vi.fn()}
      />
    );

    const addButton = screen.getByRole('button', { name: /add timer/i });
    expect(addButton).toBeInTheDocument();

    fireEvent.click(addButton);
    expect(onCreateTimerInstance).toHaveBeenCalledWith('session-1');
  });
});
