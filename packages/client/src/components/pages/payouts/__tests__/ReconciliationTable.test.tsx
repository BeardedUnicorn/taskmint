import { render, screen, fireEvent, within } from '@testing-library/react';
import { setPhoneViewport } from '../../../../__tests__/setup/viewport';
import { describe, it, expect } from 'vitest';
import { ReconciliationTable } from '../ReconciliationTable';
import { PayoutDayCell, groupCellsByMonth } from '../../../../utils/payoutCalculator';

const HOUR = 3_600_000;
const cell = (workDay: string, overrides: Partial<PayoutDayCell>): PayoutDayCell => ({
  workDay,
  taskId: 't1',
  taskName: 'Annotation',
  actualCents: 0,
  estimatedCents: 0,
  trackedMs: 0,
  importedMinutes: 0,
  statuses: [],
  releaseDay: '2026-10-08',
  isEstimate: false,
  untransferredCents: 0,
  paidCents: 0,
  ...overrides,
});

describe('ReconciliationTable', () => {
  it('shows a day reported as tracked as no difference, and tracked time with no money as tracked only', () => {
    const groups = groupCellsByMonth([
      cell('2026-10-01', { trackedMs: HOUR, importedMinutes: 60, actualCents: 4000 }),
      cell('2026-10-02', { trackedMs: 2 * HOUR }),
    ]);
    render(<ReconciliationTable monthGroups={groups} today="2026-10-05" />);

    expect(screen.getByText('±0m')).toBeInTheDocument();
    expect(screen.getByText('Tracked only')).toBeInTheDocument();
    // No money, so nothing to be available
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('folds the open month away, and opens it again', () => {
    const groups = groupCellsByMonth([cell('2026-10-01', { trackedMs: HOUR, estimatedCents: 4000, isEstimate: true })]);
    render(<ReconciliationTable monthGroups={groups} today="2026-10-05" />);
    expect(screen.getByText('Estimate')).toBeInTheDocument();

    fireEvent.click(screen.getByText('October 2026'));
    expect(screen.queryByText('Estimate')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('October 2026'));
    expect(screen.getByText('Estimate')).toBeInTheDocument();
  });

  it("on a phone, lists each month's days as rows under a header that folds them", () => {
    setPhoneViewport();
    const groups = groupCellsByMonth([
      cell('2026-10-01', { trackedMs: HOUR, importedMinutes: 90, actualCents: 4000, statuses: ['Paid'] }),
      cell('2026-10-02', { trackedMs: 2 * HOUR }),
      cell('2026-10-03', { trackedMs: HOUR, estimatedCents: 4000, isEstimate: true, taskName: 'Review' }),
      cell('2026-10-04', { importedMinutes: 60, actualCents: 3000, taskName: 'Reported only' }),
      cell('2026-09-30', { trackedMs: HOUR, importedMinutes: 30, actualCents: 2000 }),
    ]);
    render(<ReconciliationTable monthGroups={groups} today="2026-10-05" />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const october = within(screen.getByRole('list', { name: 'October 2026' }));
    const [reported, trackedOnly, estimate, reportedOnly] = october.getAllByRole('listitem');
    expect(reportedOnly).toHaveTextContent('— tracked · 1h 0m reported');
    expect(reported).toHaveTextContent('Thu, Oct 1 · Annotation$40.001h 0m tracked · 1h 30m reported+0h 30m');
    expect(reported).toHaveTextContent('available Thu, Oct 8');
    expect(within(reported).getByText('Paid')).toBeInTheDocument();
    expect(within(reported).getByText('Actual')).toBeInTheDocument();
    expect(trackedOnly).toHaveTextContent('2h 0m tracked · — reported');
    expect(trackedOnly).not.toHaveTextContent('available');
    expect(within(trackedOnly).getByText('Tracked only')).toBeInTheDocument();
    expect(within(estimate).getByText('Estimate')).toBeInTheDocument();

    // September starts folded; its header opens it, and October's folds October
    expect(screen.queryByRole('list', { name: 'September 2026' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show September 2026' }));
    expect(screen.getByRole('list', { name: 'September 2026' })).toHaveTextContent('−0h 30m');
    fireEvent.click(screen.getByRole('button', { name: 'Hide October 2026' }));
    expect(screen.queryByRole('list', { name: 'October 2026' })).not.toBeInTheDocument();
  });
});
