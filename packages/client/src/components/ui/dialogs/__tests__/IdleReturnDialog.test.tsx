import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { IdleReturnDialog } from '../IdleReturnDialog';
import { IdlePause } from '../../../../types/timer';

const away: IdlePause = {
  instanceId: 'i-1',
  taskName: 'Annotation',
  idleSince: new Date(2026, 9, 12, 14, 15).toISOString(),
  returned: true,
  awayMs: 25 * 60_000,
};

describe('IdleReturnDialog', () => {
  const onResolve = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing without a pending question', () => {
    render(<IdleReturnDialog pending={null} onResolve={onResolve} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says what paused, when, and for how long you were away', () => {
    render(<IdleReturnDialog pending={away} onResolve={onResolve} />);

    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Annotation')).toBeInTheDocument();
    expect(screen.getByText(/paused at 2:15 PM/)).toBeInTheDocument();
    expect(screen.getByText(/You were away for 25 min/)).toBeInTheDocument();
  });

  it('sends each choice', () => {
    render(<IdleReturnDialog pending={away} onResolve={onResolve} />);

    fireEvent.click(screen.getByRole('button', { name: 'Discard and resume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep 25 min and resume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stay paused' }));

    expect(onResolve.mock.calls.map(([choice]) => choice)).toEqual([
      'discardResume',
      'keepResume',
      'stayPaused',
    ]);
  });

  it('labels long absences in hours and minutes', () => {
    render(<IdleReturnDialog pending={{ ...away, awayMs: 65 * 60_000 }} onResolve={onResolve} />);
    expect(screen.getByRole('button', { name: 'Keep 1h 5m and resume' })).toBeInTheDocument();
  });

  it('shows why a choice failed, and disables the buttons while one is in flight', () => {
    const { rerender } = render(
      <IdleReturnDialog pending={away} onResolve={onResolve} error="Another timer instance is already running" />
    );
    expect(screen.getByText('Another timer instance is already running')).toBeInTheDocument();

    rerender(<IdleReturnDialog pending={away} onResolve={onResolve} isResolving />);
    expect(screen.getByRole('button', { name: 'Discard and resume' })).toBeDisabled();
  });

  it('treats Escape as Stay paused', () => {
    render(<IdleReturnDialog pending={away} onResolve={onResolve} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onResolve).toHaveBeenCalledWith('stayPaused');
  });
});
