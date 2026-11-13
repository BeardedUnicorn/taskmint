/**
 * The History charts, drawn at a fixed size (jsdom measures nothing, so the
 * responsive container is stood in for): titles, axes, the measure each
 * draws, legends, labels and the hover cards.
 */

import { cloneElement, ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskTimeBarChart, TaskTimeTooltip } from '../TaskTimeBarChart';
import { TimelineChart, TimelineTooltip } from '../TimelineChart';
import { TaskDistributionPieChart, TaskShareTooltip, foldShares } from '../TaskDistributionPieChart';
import { CATEGORICAL, MEASURES, OTHER_COLOR } from '../ChartParts';
import { setPhoneViewport } from '../../../../__tests__/setup/viewport';

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

describe('MEASURES', () => {
  it('marks ticks in hours or dollars', () => {
    expect(MEASURES.time.tick(8)).toBe('8h');
    expect(MEASURES.earnings.tick(450)).toBe('$450');
  });
});

describe('TaskTimeBarChart', () => {
  const data = [
    { taskName: 'Annotation', totalTime: 2 * HOUR, totalEarnings: 80, entryCount: 3 },
    { taskName: 'A very long task name indeed', totalTime: HOUR, totalEarnings: 40, entryCount: 1 },
  ];

  it('draws the time of each task on one axis, cutting long names', async () => {
    render(<TaskTimeBarChart data={data} measure="time" />);

    expect(screen.getByText('Time by Task')).toBeInTheDocument();
    expect(await screen.findByText('Annotation')).toBeInTheDocument();
    expect(screen.getByText('A very long tas...')).toBeInTheDocument();
    expect(screen.getByText('Hours')).toBeInTheDocument();
    // One measure: no second axis, no legend to tell them apart
    expect(screen.queryByText('Earnings ($)')).not.toBeInTheDocument();
  });

  it('draws the earnings instead when asked', async () => {
    render(<TaskTimeBarChart data={data} measure="earnings" />);
    expect(screen.getByText('Earnings by Task')).toBeInTheDocument();
    expect(await screen.findByText('Earnings ($)')).toBeInTheDocument();
    expect(screen.queryByText('Hours')).not.toBeInTheDocument();
  });

  it('shows the whole task, its time, earnings and entries on hover', () => {
    const point = {
      taskName: 'A very…',
      fullTaskName: 'A very long task',
      timeHours: 1.5,
      totalTime: 1.5 * HOUR,
      earnings: 60,
      entryCount: 2,
    };
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

  it('draws days as dates, one measure on one axis', async () => {
    render(<TimelineChart dataType="daily" measure="time" data={[{ date: '2026-03-02', ...totals }]} />);

    expect(screen.getByText('Time per day')).toBeInTheDocument();
    expect((await screen.findAllByText('Mar 2')).length).toBeGreaterThan(0);
    expect(screen.getByText('Hours')).toBeInTheDocument();
    expect(screen.queryByText('Earnings ($)')).not.toBeInTheDocument();
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
      render(<TimelineChart dataType="daily" measure="time" data={[{ date: '2026-11-06', ...totals }]} />);

      expect((await screen.findAllByText('Nov 6')).length).toBeGreaterThan(0);
      expect(screen.queryByText('Nov 5')).not.toBeInTheDocument();
    });
  });

  it('draws weeks and months by their keys, and earnings when asked', async () => {
    const { rerender } = render(
      <TimelineChart dataType="weekly" measure="earnings" data={[{ week: '2026-W10', ...totals }]} />
    );
    expect(screen.getByText('Earnings per week')).toBeInTheDocument();
    expect((await screen.findAllByText('2026-W10')).length).toBeGreaterThan(0);
    expect(screen.getByText('Earnings ($)')).toBeInTheDocument();

    rerender(<TimelineChart dataType="monthly" measure="time" data={[{ month: '2026-03', ...totals }]} />);
    expect(screen.getByText('Time per month')).toBeInTheDocument();
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
  /** The legend's swatch beside a name. */
  const swatchOf = (name: string) => screen.getByText(name).previousElementSibling;

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

  it('colours a task by its name, not its size, so it keeps its colour when shares change places', () => {
    const { unmount } = render(
      <TaskDistributionPieChart
        data={[
          { name: 'Calls', value: 6, percentage: 60 },
          { name: 'Annotation', value: 4, percentage: 40 },
        ]}
      />
    );
    expect(swatchOf('Annotation')).toHaveStyle({ backgroundColor: CATEGORICAL.light[0] });
    expect(swatchOf('Calls')).toHaveStyle({ backgroundColor: CATEGORICAL.light[1] });
    unmount();

    render(
      <TaskDistributionPieChart
        data={[
          { name: 'Annotation', value: 6, percentage: 60 },
          { name: 'Calls', value: 4, percentage: 40 },
        ]}
      />
    );
    expect(swatchOf('Annotation')).toHaveStyle({ backgroundColor: CATEGORICAL.light[0] });
  });

  it('gives the five biggest tasks a slice each and folds the rest into a grey Other', () => {
    const tasks = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name, index) => ({
      name,
      value: 7 - index,
      percentage: ((7 - index) / 28) * 100,
    }));
    render(<TaskDistributionPieChart data={tasks} />);
    for (const name of ['A', 'B', 'C', 'D']) expect(screen.getByText(name)).toBeInTheDocument();
    for (const name of ['E', 'F', 'G']) expect(screen.queryByText(name)).not.toBeInTheDocument();
    expect(swatchOf('Other')).toHaveStyle({ backgroundColor: OTHER_COLOR.light });
  });

  it("shows a task's time and share on hover", () => {
    const { container, rerender } = render(<TaskShareTooltip />);
    expect(container).toBeEmptyDOMElement();

    rerender(<TaskShareTooltip active payload={[{ payload: { name: 'Calls', value: 1.5, percentage: 33.33 } }]} />);
    expect(screen.getByText('Calls')).toBeInTheDocument();
    expect(screen.getByText('Percentage: 33.3%')).toBeInTheDocument();
  });
});

describe('foldShares', () => {
  it('keeps every share when they fit, and sums the smallest into Other when not', () => {
    const shares = [
      { name: 'Small', value: 1, percentage: 10 },
      { name: 'Big', value: 6, percentage: 60 },
      { name: 'Mid', value: 3, percentage: 30 },
    ];
    expect(foldShares(shares, 3)).toBe(shares);
    expect(foldShares(shares, 2)).toEqual([
      { name: 'Big', value: 6, percentage: 60 },
      { name: 'Other', value: 4, percentage: 40 },
    ]);
  });
});

describe('the charts on a phone', () => {
  const totals = { totalTime: 2 * HOUR, totalEarnings: 80, entryCount: 3 };

  it('run the bars across with the names level, and give the plot the width', async () => {
    setPhoneViewport(['prefers-reduced-motion']);
    const { unmount } = render(<TaskTimeBarChart data={[{ taskName: 'Annotation', ...totals }]} measure="time" />);
    expect(await screen.findByText('Annotation')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.queryByText('Hours')).not.toBeInTheDocument();
    unmount();

    render(<TimelineChart dataType="weekly" measure="time" data={[{ week: '2026-W10', ...totals }]} />);
    expect(await screen.findByText('2026-W10')).toBeInTheDocument();
    expect(screen.queryByText('Hours')).not.toBeInTheDocument();
  });

  it('draw a smaller pie', async () => {
    setPhoneViewport(['prefers-reduced-motion']);
    render(<TaskDistributionPieChart data={[{ name: 'Annotation', value: 2 * HOUR, percentage: 100 }]} />);
    expect(await screen.findByText('Annotation')).toBeInTheDocument();
  });
});
