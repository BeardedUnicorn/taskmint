import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '../../../../__tests__/setup/test-helpers';
import { seedAppRecords } from '../../../../testing';
import { DailyGoalContext, UseDailyGoalsReturn } from '../../../../hooks/useDailyGoals';
import { DailyGoal, DailyGoalAchievement } from '../../../../types/goal';
import { PayoutData } from '../../../../hooks/usePayoutData';
import { PayoutDayCell } from '../../../../utils/payoutCalculator';
import {
  MoneyProviders,
  createMockPayoutData,
  createMockPlan,
  createMockWithdrawal,
} from '../../../../__tests__/setup/payout-test-utils';
import CalendarPage from '../CalendarPage';

const NOW = new Date(2026, 10, 7, 12, 0).getTime();

function cell(workDay: string, actualCents: number): PayoutDayCell {
  return {
    workDay,
    taskId: 'armadillo',
    taskName: 'Armadillo',
    actualCents,
    estimatedCents: 0,
    trackedMs: 3_600_000,
    importedMinutes: 60,
    statuses: [],
    releaseDay: '2026-11-13',
    isEstimate: false,
    untransferredCents: 0,
    paidCents: 0,
  };
}

function renderPage(
  data: Partial<PayoutData> = {},
  goals: { currentGoal?: Partial<DailyGoal> | null; achievements?: Partial<DailyGoalAchievement>[] } = {}
) {
  const goalState = { currentGoal: goals.currentGoal ?? null, achievements: goals.achievements ?? [] };
  return render(
    <DailyGoalContext.Provider value={goalState as unknown as UseDailyGoalsReturn}>
      <MoneyProviders payoutData={createMockPayoutData({ nowMs: NOW, cells: [cell('2026-11-05', 63334)], ...data })}>
        <CalendarPage />
      </MoneyProviders>
    </DailyGoalContext.Provider>
  );
}

const dayButton = (date: string) => document.querySelector<HTMLElement>(`[data-date="${date}"]`)!;

describe('CalendarPage', () => {
  it('shows a placeholder while the numbers load', () => {
    renderPage({ isLoading: true });
    expect(screen.getByLabelText('Loading calendar')).toBeInTheDocument();
  });

  it('explains itself when there is nothing to show', () => {
    renderPage({ isEmpty: true, cells: [] });
    expect(screen.getByText('Nothing on the calendar yet')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it("still shows the month when there's only a withdrawal", () => {
    seedAppRecords({ withdrawals: [createMockWithdrawal()] });
    renderPage({ isEmpty: true, cells: [] });
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
  });

  it("shows this month's totals, the withdrawal panel and a legend", () => {
    seedAppRecords({ withdrawals: [createMockWithdrawal({ amountCents: 71250 })] });
    renderPage({
      cells: [
        cell('2026-11-05', 63334),
        { ...cell('2026-11-06', 0), estimatedCents: 5000, isEstimate: true },
        cell('2026-10-30', 99999),
      ],
      plan: createMockPlan(),
    });

    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(screen.getByText('Tracked').nextSibling).toHaveTextContent('2h 0m');
    expect(screen.getByText('Earned').nextSibling).toHaveTextContent('~$683.34');
    expect(screen.getByText('Days worked').nextSibling).toHaveTextContent('2');
    // The stat, then the legend's item
    expect(screen.getAllByText('Withdrawn')[0].nextSibling).toHaveTextContent('$712.50');
    expect(screen.getByRole('region', { name: 'Withdrawals' })).toHaveTextContent('Next withdrawal');
    expect(screen.getByText('To be released')).toBeInTheDocument();
    expect(screen.getByText('Next withdrawal opens')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
  });

  it('moves between months, and back to today', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(dayButton('2026-10-01')).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'December 2026' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(dayButton('2026-11-07')).toHaveAttribute('tabindex', '0');
  });

  it("opens a day's breakdown, steps through days, and closes it", () => {
    renderPage();
    fireEvent.click(dayButton('2026-11-05'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /Thursday, November 5, 2026/ })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next day' }));
    expect(within(dialog).getByRole('heading', { name: /Friday, November 6, 2026/ })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("measures each day against the goal it had, else today's goal", () => {
    renderPage(
      { cells: [cell('2026-11-05', 50000), cell('2026-11-06', 10000)] },
      {
        currentGoal: { isEnabled: true, targetAmount: 400 },
        achievements: [{ date: '2026-11-05', goalAmount: 300 }],
      }
    );
    const bars = screen.getAllByRole('progressbar', { hidden: true });
    expect(bars.map(bar => bar.getAttribute('aria-valuenow'))).toEqual(['100', '25']);
  });

  it('draws no goal bar when the goal is off', () => {
    renderPage({}, { currentGoal: { isEnabled: false, targetAmount: 400 } });
    expect(screen.queryAllByRole('progressbar', { hidden: true })).toHaveLength(0);
  });
});
