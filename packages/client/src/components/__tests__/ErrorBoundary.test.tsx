import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ErrorBoundary, MAX_RECOVERY_ATTEMPTS, RECOVERY_DELAY_MS, STABLE_RESET_MS } from '../ErrorBoundary';
import { reloadApp } from '../../utils/appReload';

vi.mock('../../utils/sentry', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
}));
vi.mock('../../utils/appReload', () => ({ reloadApp: vi.fn() }));

let renders = 0;
let thrown: unknown = new Error('boom');
function Bomb() {
  renders++;
  if (thrown) throw thrown;
  return <p>recovered</p>;
}

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const failed = () => screen.queryByText(/Oops! Something went wrong/);

describe('ErrorBoundary', () => {
  beforeEach(() => {
    renders = 0;
    thrown = new Error('boom');
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops retrying a persistent error after its retries', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText(`Attempting automatic recovery... (1/${MAX_RECOVERY_ATTEMPTS})`)).toBeInTheDocument();
    const rendersAfterFirstError = renders;

    // Far more time than the retries need: without a cap this would loop forever
    for (let i = 0; i < 10; i++) wait(RECOVERY_DELAY_MS);

    const retries = renders - rendersAfterFirstError;
    // The automatic retries (React may render twice per attempt), then it stops
    expect(retries).toBeGreaterThan(0);
    expect(retries).toBeLessThanOrEqual(2 * MAX_RECOVERY_ATTEMPTS);
    expect(
      screen.getByText(`Automatic recovery failed after ${MAX_RECOVERY_ATTEMPTS} attempts.`, { exact: false })
    ).toBeInTheDocument();
  });

  it('recovers when the cause goes away, and Try Again starts over', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    for (let i = 0; i < MAX_RECOVERY_ATTEMPTS; i++) wait(RECOVERY_DELAY_MS);
    expect(failed()).toBeInTheDocument();

    thrown = null;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('gives a later error its full retries once the children have stayed well a while', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    // Recovers on its first retry
    thrown = null;
    wait(RECOVERY_DELAY_MS);
    expect(screen.getByText('recovered')).toBeInTheDocument();

    // Fails again before it counts as stable: the count carries on
    thrown = new Error('again');
    rerender(
      <ErrorBoundary>
        <Bomb key="2" />
      </ErrorBoundary>
    );
    expect(screen.getByText(`Attempting automatic recovery... (2/${MAX_RECOVERY_ATTEMPTS})`)).toBeInTheDocument();

    thrown = null;
    wait(RECOVERY_DELAY_MS);
    wait(STABLE_RESET_MS);
    thrown = new Error('much later');
    rerender(
      <ErrorBoundary>
        <Bomb key="3" />
      </ErrorBoundary>
    );
    expect(screen.getByText(`Attempting automatic recovery... (1/${MAX_RECOVERY_ATTEMPTS})`)).toBeInTheDocument();
  });

  it('shows what it knows of something thrown that is no Error, and its details on request', () => {
    thrown = 'a bare string';
    render(
      <ErrorBoundary level="page">
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText('Unknown error occurred')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show Technical Details/ }));
    expect(screen.getByText('No stack trace available')).toBeInTheDocument();
    expect(screen.getByText('Component Stack:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Hide Technical Details/ }));
    expect(screen.getByRole('button', { name: /Show Technical Details/ })).toBeInTheDocument();
  });

  it('reloads the app on request, once retrying is over', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    for (let i = 0; i < MAX_RECOVERY_ATTEMPTS; i++) wait(RECOVERY_DELAY_MS);

    fireEvent.click(screen.getByRole('button', { name: 'Reload Page' }));
    expect(reloadApp).toHaveBeenCalled();
  });

  it('drops a pending retry when it goes away', () => {
    const { unmount } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    unmount();
    const before = renders;
    wait(RECOVERY_DELAY_MS);
    expect(renders).toBe(before);
  });
});
