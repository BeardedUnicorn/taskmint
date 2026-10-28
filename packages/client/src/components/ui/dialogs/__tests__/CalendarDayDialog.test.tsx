import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CalendarDayDialog } from '../CalendarDayDialog';
import { PayoutDayCell } from '../../../../utils/payoutCalculator';

const HOUR = 3_600_000;
const cell = (overrides: Partial<PayoutDayCell>): PayoutDayCell => ({
  workDay: '2026-10-01',
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

describe('CalendarDayDialog', () => {
  it('shows nothing while no day is open', () => {
    const { container } = render(<CalendarDayDialog date={null} cells={[]} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("totals a day's tasks, by time tracked or else reported, beside what it releases", () => {
    render(
      <CalendarDayDialog
        date="2026-10-01"
        onClose={vi.fn()}
        cells={[
          cell({ trackedMs: HOUR, estimatedCents: 4000 }),
          // Reported by the site only
          cell({ taskId: 't2', taskName: 'Review', importedMinutes: 30, actualCents: 2000 }),
          // Paid, with no time to show
          cell({ taskId: 't3', taskName: 'Bonus', actualCents: 500 }),
          // Worked a week ago, released this day
          cell({ taskId: 't4', taskName: 'Calls', workDay: '2026-09-24', releaseDay: '2026-10-01', actualCents: 1500 }),
        ]}
      />
    );

    const worked = screen.getByRole('table', { name: 'Worked' });
    expect(within(worked).getByText('Review').closest('tr')).toHaveTextContent('30m');
    expect(within(worked).getByText('Bonus')).toBeInTheDocument();
    expect(within(worked).getByText('Total').closest('tr')).toHaveTextContent('1h 30m');
    expect(within(screen.getByRole('table', { name: 'Released' })).getByText('Calls')).toBeInTheDocument();
  });
});
