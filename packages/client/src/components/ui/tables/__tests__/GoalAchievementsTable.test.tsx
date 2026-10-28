/**
 * GoalAchievementsTable: each day's goal, earnings, progress and result,
 * newest first; today short of the goal is still in progress.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GoalAchievementsTable } from '../GoalAchievementsTable';
import { DailyGoalAchievement } from '../../../../types/goal';
import { formatDateString } from '../../../../utils/dateHelpers';

const day = (date: string, status: DailyGoalAchievement['status'], difference: number): DailyGoalAchievement => ({
  id: `${date}-${status}`,
  date,
  goalAmount: 100,
  earnedAmount: 100 + difference,
  currency: 'USD',
  percentageAchieved: 100 + difference,
  status,
  difference,
  recordedAt: '2026-01-01T00:00:00Z',
});

describe('GoalAchievementsTable', () => {
  it('says when there are no days to show', () => {
    render(<GoalAchievementsTable achievements={[]} />);
    expect(screen.getByText('No goal achievements found for the selected date range.')).toBeInTheDocument();
  });

  it("shows each day's result, newest first", () => {
    render(
      <GoalAchievementsTable
        achievements={[day('2026-01-01', 'missed', -40), day('2026-01-03', 'exceeded', 25), day('2026-01-02', 'hit', 0)]}
      />
    );

    const [exceeded, hit, missed] = screen.getAllByRole('row').slice(1);
    expect(within(exceeded).getByText('Exceeded')).toBeInTheDocument();
    expect(within(exceeded).getByText('+$25.00')).toBeInTheDocument();
    // The bar stops at 100%; the figure doesn't
    expect(within(exceeded).getByText('125%')).toBeInTheDocument();
    expect(within(hit).getByText('Hit')).toBeInTheDocument();
    expect(within(hit).getByText('+$0.00')).toBeInTheDocument();
    expect(within(missed).getByText('Missed')).toBeInTheDocument();
    expect(within(missed).getByText('$40.00')).toBeInTheDocument();
    expect(within(missed).getByText('60%')).toBeInTheDocument();
  });

  it("shows today's shortfall as what's left to earn", () => {
    render(<GoalAchievementsTable achievements={[day(formatDateString(new Date()), 'missed', -30)]} />);

    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('$30.00 remaining')).toBeInTheDocument();
  });
});
