/**
 * TimerService Tests
 *
 * Covers starting/stopping timers, rounding options, active timer state,
 * and error handling using mocked storage and Tauri helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimerService } from '../TimerService';
import type { TimeEntry, TimerRoundingOption } from '../../types/timer';
import type { IStorageService } from '../StorageService';

// Mock Tauri helpers
vi.mock('../../utils/tauri', () => ({
  safeInvoke: vi.fn(),
  isTauriEnvironment: vi.fn(),
}));

import { safeInvoke, isTauriEnvironment } from '../../utils/tauri';

describe('TimerService', () => {
  let service: TimerService;
  let entries: TimeEntry[];
  let mockStorageService: IStorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    entries = [];
    mockStorageService = {
      getTimeEntries: vi.fn().mockImplementation(() => Promise.resolve(entries)),
      setTimeEntries: vi
        .fn()
        .mockImplementation((newEntries: TimeEntry[]) => {
          entries = newEntries;
          return Promise.resolve();
        }),
    } as unknown as IStorageService;

    // Always run in Tauri environment for these tests
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
    vi.mocked(safeInvoke).mockResolvedValue(null);

    service = new TimerService(mockStorageService);
  });

  describe('startTimer and stopTimer', () => {
    it('should start and stop a timer with rounding and update active state', async () => {
      const startTime = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
      const entry = await service.startTimer('Test Task', 'task1', startTime);

      expect(entry.taskName).toBe('Test Task');
      expect(entry.isRunning).toBe(true);
      expect(await service.getActiveTimer()).toEqual(entry);
      expect(safeInvoke).toHaveBeenCalledWith(
        'update_timer_state',
        expect.objectContaining({ isRunning: true })
      );

      const stopped = await service.stopTimer(entry.id, 'up-5min');

      expect(stopped.isRunning).toBe(false);
      expect(stopped.duration).toBe(5 * 60 * 1000); // rounded up to 5 minutes
      expect(await service.getActiveTimer()).toBeNull();
      expect(safeInvoke).toHaveBeenCalledWith(
        'update_timer_state',
        expect.objectContaining({ isRunning: false })
      );
    });

    it.each([
      ['up-5min', 3, 5],
      ['up-15min', 7, 15],
    ])('should round duration using %s option', async (
      rounding: TimerRoundingOption,
      elapsed: number,
      expected: number
    ) => {
      const startTime = new Date(Date.now() - elapsed * 60 * 1000);
      const entry = await service.startTimer('Round Test', undefined, startTime);
      const stopped = await service.stopTimer(entry.id, rounding);
      expect(stopped.duration).toBe(expected * 60 * 1000);
    });
  });

  describe('error handling and validation', () => {
    it('should throw error when starting timer with empty task name', async () => {
      await expect(service.startTimer('')).rejects.toMatchObject({
        message: 'Failed to start timer',
        code: 'TIMER_START_FAILED',
      });
    });

    it('should prevent multiple timers running simultaneously', async () => {
      await service.startTimer('First');
      await expect(service.startTimer('Second')).rejects.toMatchObject({
        message: 'Failed to start timer',
        code: 'TIMER_START_FAILED',
      });
    });

    it('should throw error when stopping a non-existent timer', async () => {
      await expect(service.stopTimer('missing')).rejects.toMatchObject({
        message: 'Failed to stop timer',
        code: 'TIMER_STOP_FAILED',
      });
    });
  });
});

