import { render, screen, fireEvent } from '@testing-library/react';
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
  it("shows a day reported as tracked as no difference, and tracked time with no money as tracked only", () => {
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
});
