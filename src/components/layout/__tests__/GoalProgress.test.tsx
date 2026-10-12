import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { GoalProgress } from '../GoalProgress';
import { Sidebar } from '../Sidebar';
import { DailyGoalProgressData } from '../../../hooks/useDailyGoalProgressMonitor';

const progress = (overrides: Partial<DailyGoalProgressData> = {}): DailyGoalProgressData => ({
  enabled: true,
  earned: 42.1,
  target: 100,
  percent: 42.1,
  currency: 'USD',
  ...overrides,
});

describe('GoalProgress', () => {
  it("shows today's earnings against the target with a bar", () => {
    render(<GoalProgress progress={progress()} />);

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('$42.10 of $100.00')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('caps the bar at 100% but reports the real percent once the goal is passed', () => {
    render(<GoalProgress progress={progress({ earned: 130, percent: 130 })} />);

    expect(screen.getByText('130%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('becomes a ring with the percent when the sidebar is collapsed', () => {
    render(<GoalProgress progress={progress()} collapsed />);

    expect(screen.getByRole('img', { name: "Today's goal: $42.10 of $100.00 (42%)" })).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  it('renders nothing without a goal', () => {
    const { container } = render(<GoalProgress progress={progress({ enabled: false })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Sidebar footer', () => {
  it('renders the footer at the bottom, told whether the sidebar is collapsed', () => {
    const footer = vi.fn((collapsed: boolean) => <span>{collapsed ? 'ring' : 'bar'}</span>);
    render(<Sidebar activeView="sessions" onViewChange={() => {}} footer={footer} />);

    expect(screen.getByText('bar')).toBeInTheDocument();
    expect(footer).toHaveBeenCalledWith(false);
  });
});
