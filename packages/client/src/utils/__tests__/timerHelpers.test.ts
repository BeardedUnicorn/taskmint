import { describe, expect, it } from 'vitest';
import { buildTimerEditUpdates, getInstanceElapsedMs } from '../timerHelpers';
import { TimerInstance, TimerState } from '../../types/timer';

const instance = (overrides: Partial<TimerInstance>): TimerInstance => ({
  id: 'i',
  sessionId: 's',
  startTime: '2026-10-27T09:00:00.000Z',
  state: TimerState.stopped,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe("a timer's elapsed time", () => {
  const now = Date.parse('2026-10-27T10:00:00.000Z');

  it('counts from a start given as a Date', () => {
    const running = instance({
      state: TimerState.running,
      startTime: new Date('2026-10-27T09:30:00.000Z') as unknown as string,
    });
    expect(getInstanceElapsedMs(running, now)).toBe(30 * 60_000);
  });

  it('is nothing for a running timer without a readable start', () => {
    expect(getInstanceElapsedMs(instance({ state: TimerState.running, startTime: 'garbled' }), now)).toBe(0);
  });

  it("is a paused timer's stored duration when it can't be worked out", () => {
    expect(getInstanceElapsedMs(instance({ state: TimerState.paused, pausedAt: null, duration: 5_000 }), now)).toBe(
      5_000
    );
    expect(
      getInstanceElapsedMs(
        instance({ state: TimerState.paused, startTime: '', pausedAt: '2026-10-27T09:10:00.000Z' }),
        now
      )
    ).toBe(0);
  });
});

describe('editing a timer', () => {
  it('ends it at the epoch plus its duration when its start is unreadable', () => {
    expect(buildTimerEditUpdates(instance({ startTime: 'garbled' }), 1_000).endTime).toBe('1970-01-01T00:00:01.000Z');
  });
});
