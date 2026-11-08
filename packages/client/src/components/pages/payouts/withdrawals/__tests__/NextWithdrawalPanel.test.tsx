import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '../../../../../__tests__/setup/test-helpers';
import { seedAppRecords } from '../../../../../testing';
import { UNREADABLE_WITHDRAWALS } from '../../../../../hooks/useWithdrawals';
import { createMockAmount, createMockPlan, renderWithMoney } from '../../../../../__tests__/setup/payout-test-utils';
import { NextWithdrawalPanel, amountNotes } from '../NextWithdrawalPanel';

const NOW = new Date(2026, 10, 8, 12, 0).getTime();
const panel = () => screen.getByRole('region', { name: 'Withdrawals' });

describe('amountNotes', () => {
  it('notes estimates and money still awaiting approval, or nothing', () => {
    expect(amountNotes(createMockAmount({ actualCents: 100 }))).toBeNull();
    expect(amountNotes(createMockAmount({ actualCents: 80000, estimatedCents: 8000, pastDueCents: 80000 }))).toBe(
      "includes ~$80.00 estimated from tracked time · $800.00 still awaiting the site's approval"
    );
  });
});

describe('NextWithdrawalPanel', () => {
  it('asks for the last withdrawal until one is recorded', () => {
    renderWithMoney(<NextWithdrawalPanel />, { nowMs: NOW });
    expect(panel()).toHaveTextContent('Track your withdrawals');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Record withdrawal' }));
    expect(screen.getByRole('dialog', { name: 'Record withdrawal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says when the next withdrawal opens and how much it will be', () => {
    renderWithMoney(<NextWithdrawalPanel />, {
      nowMs: NOW,
      withdrawalIntervalDays: 3,
      plan: createMockPlan({ next: createMockAmount({ actualCents: 110000, estimatedCents: 8000 }) }),
    });
    expect(panel()).toHaveTextContent('Next withdrawal');
    expect(panel()).toHaveTextContent('Tue, Nov 10, 6:25 PM');
    expect(panel()).toHaveTextContent('in 2d 6h');
    expect(panel()).toHaveTextContent('It will be~$1,180.00');
    expect(panel()).toHaveTextContent('includes ~$80.00 estimated from tracked time');
    expect(panel()).toHaveTextContent(
      'Last withdrawal: Sat, Nov 7, 6:25 PM · $712.50. The site allows one every 3 days.'
    );
    expect(within(panel()).getByRole('button', { name: 'Record withdrawal' })).toHaveClass('MuiButton-outlined');
  });

  it('says when a withdrawal is open now, and what it would take', () => {
    renderWithMoney(<NextWithdrawalPanel />, {
      nowMs: NOW,
      withdrawalIntervalDays: 1,
      plan: createMockPlan({ isOpen: true, opensAtMs: NOW, next: createMockAmount() }),
    });
    expect(panel()).toHaveTextContent('Withdrawal open');
    expect(panel()).toHaveTextContent('You can withdraw now');
    expect(panel()).toHaveTextContent('Available$0.00');
    expect(panel()).not.toHaveTextContent(' in ');
    expect(panel()).toHaveTextContent('The site allows one every 1 day.');
    expect(within(panel()).getByRole('button', { name: 'Record withdrawal' })).toHaveClass('MuiButton-contained');
  });

  it('lists what waiting would add', () => {
    renderWithMoney(<NextWithdrawalPanel />, {
      nowMs: NOW,
      plan: createMockPlan({
        ifYouWait: [
          { atMs: new Date(2026, 10, 11, 18, 40).getTime(), addedCents: 37500, totalCents: 147500, hasEstimate: false },
          { atMs: new Date(2026, 10, 12, 9, 0).getTime(), addedCents: 2000, totalCents: 149500, hasEstimate: true },
        ],
      }),
    });
    const toggle = screen.getByRole('button', { name: 'If you wait' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const rows = within(screen.getByRole('table', { name: 'If you wait' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows[0]).toHaveTextContent('Wed, Nov 11, 6:40 PM+$375.00$1,475.00');
    expect(rows[1]).toHaveTextContent('+~$20.00$1,495.00');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it("reports withdrawals it can't read instead of a figure", () => {
    seedAppRecords({ withdrawals: 'garbled' });
    renderWithMoney(<NextWithdrawalPanel />, { nowMs: NOW });
    expect(within(panel()).getByRole('alert')).toHaveTextContent(UNREADABLE_WITHDRAWALS);
  });
});
