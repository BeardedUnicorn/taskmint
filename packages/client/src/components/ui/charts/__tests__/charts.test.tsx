/**
 * The History charts, drawn at a fixed size (jsdom measures nothing, so the
 * responsive container is stood in for): titles, axes, legends, labels and
 * the hover cards.
 */

import { cloneElement, ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskTimeBarChart, TaskTimeTooltip } from '../TaskTimeBarChart';
import { TimelineChart, TimelineTooltip } from '../TimelineChart';
import { TaskDistributionPieChart, TaskShareTooltip } from '../TaskDistributionPieChart';

vi.mock('recharts', async importOriginal => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
    cloneElement(children, { width: 800, height: 400 }),
}));

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  // Drawn at once (no animation), as for someone who prefers reduced motion
  vi.mocked(window.matchMedia).mockImplementation(
    query =>
      ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList
  );
});

describe('TaskTimeBarChart', () => {
  it('draws each task, cutting long names on the axis, with its legend', async () => {
    render(
      <TaskTimeBarChart
        data={[
          { taskName: 'Annotation', totalTime: 2 * HOUR, totalEarnings: 80, entryCount: 3 },
          { taskName: 'A very long task name indeed', totalTime: HOUR, totalEarnings: 40, entryCount: 1 },
        ]}
      />
    );

    expect(screen.getByText('Time Spent by Task')).toBeInTheDocument();
    expect(await screen.findByText('Annotation')).toBeInTheDocument();
    expect(screen.getByText('A very long tas...')).toBeInTheDocument();
    expect(screen.getByText('Time (hours)')).toBeInTheDocument();
    expect(screen.getAllByText('Earnings ($)').length).toBeGreaterThan(0);
  });


  it('shows the whole task, its time, earnings and entries on hover', () => {
    const point = { taskName: 'A very…', fullTaskName: 'A very long task', timeHours: 1.5, totalTime: 1.5 * HOUR, earnings: 60, entryCount: 2 };
    const { container, rerender } = render(<TaskTimeTooltip active={false} payload={[{ payload: point }]} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<TaskTimeTooltip active payload={[{ payload: point }]} />);
    expect(screen.getByText('A very long task')).toBeInTheDocument();
    expect(screen.getByText('Earnings: $60.00')).toBeInTheDocument();
    expect(screen.getByText('Entries: 2')).toBeInTheDocument();
  });
});

describe('TimelineChart', () => {
  const totals = { totalTime: HOUR, totalEarnings: 40, entryCount: 1 };

  it('draws days as dates', async () => {
    render(<TimelineChart dataType="daily" data={[{ date: '2026-03-02', ...totals }]} />);

    expect(screen.getByText('Daily Time Tracking Trends')).toBeInTheDocument();
    expect((await screen.findAllByText('Mar 2')).length).toBeGreaterThan(0);
  });

  describe('west of UTC', () => {
    // A bare YYYY-MM-DD read as a Date is UTC midnight: the evening before here
    beforeEach(() => {
      vi.stubEnv('TZ', 'America/Denver');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('labels a day as that day, not the one before', async () => {
      render(<TimelineChart dataType="daily" data={[{ date: '2026-11-06', ...totals }]} />);

      expect((await screen.findAllByText('Nov 6')).length).toBeGreaterThan(0);
      expect(screen.queryByText('Nov 5')).not.toBeInTheDocument();
    });
  });

  it('draws weeks and months by their keys', async () => {
    const { rerender } = render(<TimelineChart dataType="weekly" data={[{ week: '2026-W10', ...totals }]} />);
    expect(screen.getByText('Weekly Time Tracking Trends')).toBeInTheDocument();
    expect((await screen.findAllByText('2026-W10')).length).toBeGreaterThan(0);

    rerender(<TimelineChart dataType="monthly" data={[{ month: '2026-03', ...totals }]} />);
    expect(screen.getByText('Monthly Time Tracking Trends')).toBeInTheDocument();
    expect((await screen.findAllByText('2026-03')).length).toBeGreaterThan(0);
  });


  it('shows the period, its time, earnings and entries on hover', () => {
    const point = { period: '2026-W10', timeHours: 1, totalTime: HOUR, earnings: 40, entryCount: 1 };
    const { container, rerender } = render(<TimelineTooltip active payload={[]} label="2026-W10" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<TimelineTooltip active payload={[{ payload: point }]} label="2026-W10" />);
    expect(screen.getByText('2026-W10')).toBeInTheDocument();
    expect(screen.getByText('Entries: 1')).toBeInTheDocument();
  });
});

describe('TaskDistributionPieChart', () => {
  it('labels each slice big enough with its share, and lists every task', async () => {
    render(
      <TaskDistributionPieChart
        data={[
          { name: 'Annotation', value: 10, percentage: 65 },
          { name: 'Review', value: 0.3, percentage: 2 },
          { name: 'Calls', value: 5, percentage: 33 },
        ]}
      />
    );

    expect(screen.getByText('Task Time Distribution')).toBeInTheDocument();
    expect(await screen.findByText('65%')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.queryByText('2%')).not.toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });


  it("shows a task's time and share on hover", () => {
    const { container, rerender } = render(<TaskShareTooltip />);
    expect(container).toBeEmptyDOMElement();

    rerender(<TaskShareTooltip active payload={[{ payload: { name: 'Calls', value: 1.5, percentage: 33.33 } }]} />);
    expect(screen.getByText('Calls')).toBeInTheDocument();
    expect(screen.getByText('Percentage: 33.3%')).toBeInTheDocument();
  });
});
