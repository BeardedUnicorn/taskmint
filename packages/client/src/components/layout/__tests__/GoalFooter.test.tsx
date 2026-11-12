import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoalFooter } from '../GoalFooter';
import { DailyGoalProvider } from '../../../contexts/DailyGoalContext';
import { DailyGoalProgressProvider } from '../../../contexts/DailyGoalProgressContext';
import { STORAGE_KEYS } from '../../../constants';
import { formatDateString } from '../../../utils/dateHelpers';
import { seedAppRecords } from '../../../testing';

vi.mock('../../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => ({ sessions: [] }),
}));
vi.mock('../../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => ({ tasks: [] }),
}));
vi.mock('../../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

describe('GoalFooter', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing without a goal', () => {
    const { container } = render(
      <DailyGoalProvider>
        <DailyGoalProgressProvider>
          <GoalFooter collapsed={false} />
        </DailyGoalProgressProvider>
      </DailyGoalProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows today's progress in the goal's currency", () => {
    const now = new Date().toISOString();
    seedAppRecords({
      [STORAGE_KEYS.DAILY_GOAL]: {
        targetAmount: 200,
        currency: 'EUR',
        isEnabled: true,
        lastNotifiedPercent: 0,
        lastNotificationDate: formatDateString(new Date()),
        createdAt: now,
        updatedAt: now,
      },
    });

    render(
      <DailyGoalProvider>
        <DailyGoalProgressProvider>
          <GoalFooter collapsed={false} />
        </DailyGoalProgressProvider>
      </DailyGoalProvider>
    );

    expect(screen.getByText(/€0\.00 of €200\.00/)).toBeInTheDocument();
  });

  it('needs the progress provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<GoalFooter collapsed={false} />)).toThrow(/DailyGoalProgressProvider/);
  });
});
