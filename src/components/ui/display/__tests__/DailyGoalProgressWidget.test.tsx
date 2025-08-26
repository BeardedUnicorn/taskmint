import { render, screen } from '@testing-library/react';
import { DailyGoalProgressWidget } from '../DailyGoalProgressWidget';
import { DailyGoal } from '../../../types/goal';

describe('DailyGoalProgressWidget', () => {
  it('shows inactive message when no goal is set', () => {
    render(<DailyGoalProgressWidget currentEarnings={0} dailyGoal={null} />);
    expect(screen.getByText('Daily goal not active')).toBeInTheDocument();
  });

  it('displays progress when goal is active', () => {
    const goal: DailyGoal = {
      targetAmount: 100,
      currency: 'USD',
      isEnabled: true,
      lastNotifiedPercent: 0,
      lastNotificationDate: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(<DailyGoalProgressWidget currentEarnings={50} dailyGoal={goal} />);
    expect(screen.getByText('Daily Goal Progress')).toBeInTheDocument();
    expect(screen.getByText('50% Complete')).toBeInTheDocument();
  });
});
