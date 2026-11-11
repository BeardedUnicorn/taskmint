import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '../../../../__tests__/setup/test-helpers';
import {
  createMockAmount,
  createMockPlan,
  createMockWithdrawal,
  renderWithMoney,
} from '../../../../__tests__/setup/payout-test-utils';
import { ReleaseScheduleRow } from '../../../../utils/payoutCalculator';
import { ReleaseScheduleTable } from '../ReleaseScheduleTable';

const NOW = new Date(2026, 10, 8, 12, 0).getTime();
// The mock plan's withdrawals open Tue, Nov 10, 6:25 PM
const OPENING = 'Tue, Nov 10, 6:25 PM';

function row(day: number, hour: number, actualCents = 1000): ReleaseScheduleRow {
  const at = new Date(2026, 10, day, hour, 0);
  return {
    releaseDay: `2026-11-${day}`,
    releaseTime: `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`,
    releaseIso: at.toISOString(),
    releaseMs: at.getTime(),
    actualCents,
    estimatedCents: 0,
  };
}

const schedule = [row(9, 12), row(10, 15), row(11, 9)];
const table = () => screen.getByRole('table', { name: 'Upcoming releases' });
const bodyRows = () => within(table()).getAllByRole('row').slice(1);
const held = () => within(table()).queryAllByRole('img', { name: `Held until withdrawals open on ${OPENING}` });

describe('ReleaseScheduleTable', () => {
  it('shows nothing without upcoming releases', () => {
    renderWithMoney(<ReleaseScheduleTable />, { nowMs: NOW });
    expect(screen.queryByText('Upcoming releases')).not.toBeInTheDocument();
  });

  it('locks the releases held until withdrawals open, with a line where they open', () => {
    renderWithMoney(<ReleaseScheduleTable />, { nowMs: NOW, schedule, plan: createMockPlan() });
    expect(held()).toHaveLength(2);
    expect(
      screen.getByText(`Held until your next withdrawal opens on ${OPENING}: the site allows one every 3 days.`)
    ).toBeInTheDocument();

    const rows = bodyRows();
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringContaining('2026-11-9'),
      expect.stringContaining('2026-11-10'),
      `Withdrawals open ${OPENING}`,
      expect.stringContaining('2026-11-11'),
    ]);
    expect(within(rows[3]).queryByRole('img', { name: /Held/ })).not.toBeInTheDocument();
  });

  it('puts the line last when every release is held, and holds none while withdrawals are open', () => {
    const { unmount } = renderWithMoney(<ReleaseScheduleTable />, {
      nowMs: NOW,
      schedule: schedule.slice(0, 2),
      plan: createMockPlan(),
      withdrawalIntervalDays: 1,
    });
    expect(bodyRows().at(-1)).toHaveTextContent(`Withdrawals open ${OPENING}`);
    expect(screen.getByText(/the site allows one every 1 day\.$/)).toBeInTheDocument();
    unmount();

    const { unmount: unmountOpen } = renderWithMoney(<ReleaseScheduleTable />, {
      nowMs: NOW,
      schedule,
      plan: createMockPlan({ isOpen: true, opensAtMs: NOW }),
    });
    expect(held()).toHaveLength(0);
    expect(screen.queryByText(/Withdrawals open/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Held until your next withdrawal/)).not.toBeInTheDocument();
    unmountOpen();

    // No withdrawal recorded: nothing to wait for
    renderWithMoney(<ReleaseScheduleTable />, { nowMs: NOW, schedule });
    expect(held()).toHaveLength(0);
    expect(bodyRows()).toHaveLength(3);
  });

  it('shows each release with its time, amounts and total', () => {
    // A release with no exact time (a day's): no time under its date
    const estimated = { ...row(12, 8, 0), releaseTime: undefined, releaseIso: undefined, estimatedCents: 4000 };
    renderWithMoney(<ReleaseScheduleTable />, { nowMs: NOW, schedule: [row(11, 9, 3500), estimated] });
    const [imported, estimate] = bodyRows();
    expect(imported).toHaveTextContent('2026-11-119:00 AM$35.00—$35.00');
    expect(estimate).toHaveTextContent('2026-11-12—~$40.00$40.00');
  });

  it('schedules a withdrawal from a release, by its row or its button', () => {
    renderWithMoney(<ReleaseScheduleTable />, { nowMs: NOW, schedule, plan: createMockPlan() });
    fireEvent.click(bodyRows()[3]);
    expect(screen.getByRole('dialog', { name: 'Schedule withdrawal' })).toHaveTextContent('Wed, Nov 11, 9:00 AM');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Schedule a withdrawal for the release on Mon, Nov 9, 12:00 PM' })
    );
    // Held: it's ready when withdrawals open
    expect(screen.getByRole('dialog', { name: 'Schedule withdrawal' })).toHaveTextContent(`Remind me${OPENING}`);
  });

  it('marks the release the withdrawal is scheduled for', () => {
    renderWithMoney(<ReleaseScheduleTable />, {
      nowMs: NOW,
      schedule,
      plan: createMockPlan({ last: createMockWithdrawal() }),
      reminder: {
        id: 's1',
        releaseMs: schedule[2].releaseMs,
        dueMs: schedule[2].releaseMs,
        isHeld: false,
        amount: createMockAmount(),
      },
    });
    const button = screen.getByRole('button', { name: 'Scheduled withdrawal for the release on Wed, Nov 11, 9:00 AM' });
    expect(button.closest('tr')).toHaveClass('Mui-selected');
    expect(bodyRows()[0]).not.toHaveClass('Mui-selected');
  });
});
