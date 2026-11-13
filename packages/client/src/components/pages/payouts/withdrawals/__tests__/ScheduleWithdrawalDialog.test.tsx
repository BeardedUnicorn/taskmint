import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '../../../../../__tests__/setup/test-helpers';
import { fakeBackend, seedAppRecords } from '../../../../../testing';
import { readAppRecord } from '../../../../../services/appRecords';
import {
  createMockAmount,
  createMockPlan,
  createMockReleaseEvent,
  renderWithMoney,
} from '../../../../../__tests__/setup/payout-test-utils';
import { ReleaseScheduleRow } from '../../../../../utils/payoutCalculator';
import { WithdrawalReminder } from '../../../../../utils/withdrawals';
import { ScheduleWithdrawalDialog } from '../ScheduleWithdrawalDialog';

const NOW = new Date(2026, 10, 8, 12, 0).getTime();
const HELD = new Date(2026, 10, 9, 12, 0).getTime();
// After the mock plan's opening (Tue, Nov 10, 6:25 PM)
const FREE = new Date(2026, 10, 10, 23, 53).getTime();

const row = (releaseMs: number): ReleaseScheduleRow => ({
  releaseDay: '2026-11-10',
  releaseMs,
  actualCents: 0,
  estimatedCents: 0,
});

// $100.00 released before the opening, and $525.00 (plus a ~$80.00 estimate) after it
const events = [
  createMockReleaseEvent({ releaseMs: HELD, actualCents: 10000 }),
  createMockReleaseEvent(),
  createMockReleaseEvent({ releaseMs: FREE, actualCents: 0, estimatedCents: 8000, status: undefined }),
];

const reminder = (releaseMs: number): WithdrawalReminder => ({
  id: 's1',
  releaseMs,
  dueMs: releaseMs,
  isHeld: false,
  amount: createMockAmount(),
});

const dialog = () => screen.getByRole('dialog');

describe('ScheduleWithdrawalDialog', () => {
  it('schedules the next withdrawal for a release, with what it will take then', () => {
    const onClose = vi.fn();
    renderWithMoney(<ScheduleWithdrawalDialog row={row(FREE)} onClose={onClose} />, {
      nowMs: NOW,
      events,
      plan: createMockPlan(),
    });
    expect(screen.getByRole('dialog', { name: 'Schedule withdrawal' })).toHaveTextContent(
      'Remind meTue, Nov 10, 11:53 PM'
    );
    expect(dialog()).toHaveTextContent('It will be~$705.00');
    expect(dialog()).toHaveTextContent('includes ~$80.00 estimated from tracked time');
    expect(dialog()).not.toHaveTextContent('lands before your next withdrawal opens');

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(readAppRecord('scheduledWithdrawal')).toMatchObject({ releaseAt: new Date(FREE).toISOString() });
    expect(onClose).toHaveBeenCalled();
    // The reminder is a notification: a phone asks to send it
    expect(fakeBackend().platform.notifications.askPermission).toHaveBeenCalled();
  });

  it('reminds you when withdrawals open for a held release', () => {
    renderWithMoney(<ScheduleWithdrawalDialog row={row(HELD)} onClose={vi.fn()} />, {
      nowMs: NOW,
      events,
      withdrawalIntervalDays: 1,
      plan: createMockPlan(),
    });
    expect(dialog()).toHaveTextContent('Remind meTue, Nov 10, 6:25 PM');
    expect(dialog()).toHaveTextContent('It will be$100.00');
    expect(dialog()).toHaveTextContent(
      'This release on Mon, Nov 9, 12:00 PM lands before your next withdrawal opens (the site allows one every 1 day), so the reminder comes when it opens.'
    );
  });

  it('says it replaces the reminder already set', () => {
    const onClose = vi.fn();
    renderWithMoney(<ScheduleWithdrawalDialog row={row(FREE)} onClose={onClose} />, {
      nowMs: NOW,
      events,
      plan: createMockPlan(),
      reminder: reminder(HELD),
    });
    expect(dialog()).toHaveTextContent('This replaces your reminder for Mon, Nov 9, 12:00 PM.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(readAppRecord('scheduledWithdrawal')).toBeUndefined();
  });

  it('removes the reminder from its own release', () => {
    seedAppRecords({
      scheduledWithdrawal: {
        id: 's1',
        releaseAt: new Date(FREE).toISOString(),
        createdAt: new Date(NOW).toISOString(),
      },
    });
    const onClose = vi.fn();
    renderWithMoney(<ScheduleWithdrawalDialog row={row(FREE)} onClose={onClose} />, {
      nowMs: NOW,
      events,
      plan: createMockPlan(),
      reminder: reminder(FREE),
    });
    expect(screen.getByRole('dialog', { name: 'Scheduled withdrawal' })).toHaveTextContent("You'll be reminded");
    expect(dialog()).not.toHaveTextContent('This replaces');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(readAppRecord('scheduledWithdrawal')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Remove reminder' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(readAppRecord('scheduledWithdrawal')).toBeUndefined();
  });

  it('has no amount until a withdrawal is recorded', () => {
    renderWithMoney(<ScheduleWithdrawalDialog row={row(HELD)} onClose={vi.fn()} />, { nowMs: NOW, events });
    expect(dialog()).toHaveTextContent('Remind meMon, Nov 9, 12:00 PM');
    expect(dialog()).toHaveTextContent('Record your last withdrawal to see how much this one will be.');
    expect(dialog()).not.toHaveTextContent('It will be');
  });
});
