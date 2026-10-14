import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

vi.mock('../../utils/sentry', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
}));

let renders = 0;
let shouldThrow = true;
function Bomb() {
  renders++;
  if (shouldThrow) throw new Error('boom');
  return <p>recovered</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    renders = 0;
    shouldThrow = true;
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops retrying a persistent error after maxRecoveryAttempts', () => {
    render(
      <ErrorBoundary maxRecoveryAttempts={2} recoveryDelay={1000}>
        <Bomb />
      </ErrorBoundary>
    );
    const rendersAfterFirstError = renders;

    // Far more time than two retries need: without a cap this would loop forever
    for (let i = 0; i < 10; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    const retries = renders - rendersAfterFirstError;
    // Two automatic retries (React may render twice per attempt), then it stops
    expect(retries).toBeGreaterThan(0);
    expect(retries).toBeLessThanOrEqual(4);
    expect(screen.getByText(/Oops! Something went wrong/)).toBeInTheDocument();
  });

  it('recovers when the cause goes away, and Retry starts over', () => {
    render(
      <ErrorBoundary maxRecoveryAttempts={1} recoveryDelay={1000}>
        <Bomb />
      </ErrorBoundary>
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/Oops! Something went wrong/)).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});
