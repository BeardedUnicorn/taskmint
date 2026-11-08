import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '../../../../../__tests__/setup/test-helpers';
import { seedAppRecords } from '../../../../../testing';
import { readAppRecord } from '../../../../../services/appRecords';
import { createMockWithdrawal, renderWithMoney } from '../../../../../__tests__/setup/payout-test-utils';
import { WithdrawalsCard } from '../WithdrawalsCard';

describe('WithdrawalsCard', () => {
  it('says none are recorded yet', () => {
    renderWithMoney(<WithdrawalsCard />);
    expect(screen.getByText('No withdrawals recorded')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('lists withdrawals newest first with their total, to edit or delete', () => {
    seedAppRecords({
      withdrawals: [
        createMockWithdrawal({ id: 'old', takenAt: new Date(2026, 10, 4, 9, 0).toISOString(), amountCents: 30000 }),
        createMockWithdrawal({ id: 'new', note: 'PayPal' }),
      ],
    });
    renderWithMoney(<WithdrawalsCard />);

    expect(screen.getByText('2 recorded · $1,012.50 in all')).toBeInTheDocument();
    const rows = within(screen.getByRole('table', { name: 'Withdrawals' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows[0]).toHaveTextContent('Sat, Nov 7, 6:25 PM$712.50PayPal');
    expect(rows[1]).toHaveTextContent('Wed, Nov 4, 9:00 AM$300.00—');

    fireEvent.click(screen.getByRole('button', { name: 'Edit the withdrawal on Nov 7, 6:25 PM' }));
    expect(screen.getByRole('dialog', { name: 'Edit withdrawal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete the withdrawal on Nov 4, 9:00 AM' }));
    expect(readAppRecord('withdrawals')).toEqual([expect.objectContaining({ id: 'new' })]);
  });

  it("stays out of the way when the withdrawals can't be read", () => {
    seedAppRecords({ withdrawals: [{ broken: true }] });
    renderWithMoney(<WithdrawalsCard />);
    expect(screen.queryByText('Withdrawals')).not.toBeInTheDocument();
  });
});
