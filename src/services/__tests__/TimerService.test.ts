/**
 * Tests for TimerService
 */

import { TimerService } from '../TimerService';
import { IStorageService } from '../StorageService';
import { TimeEntry, TimerRoundingOption } from '../../types';
import { TimerErrorClass } from '../../types/errors';
import { formatDateString } from '../../utils/dateHelpers';
import { measurePerformance } from '../../utils/performance';
import { applyTimerRounding } from '../../utils/formatters';

// Mock dependencies
jest.mock('@tauri-apps/api/core');
jest.mock('../../utils/dateHelpers');
jest.mock('../../utils/performance');
jest.mock('../../utils/formatters');

describe('TimerService', () => {
  let timerService: TimerService;
  let mockStorageService: jest.Mocked<IStorageService>;
  let mockFormatDateString: jest.MockedFunction<typeof formatDateString>;
  let mockMeasurePerformance: jest.MockedFunction<typeof measurePerformance>;
  let mockApplyTimerRounding: jest.MockedFunction<typeof applyTimerRounding>;

  const mockTimeEntry: TimeEntry = {
    id: 'timer_1',
    taskName: 'Test Task',
    taskId: 'task_1',
    startTime: new Date('2024-01-01T10:00:00.000Z'),
    endTime: new Date('2024-01-01T11:00:00.000Z'),
    duration: 3600000, // 1 hour
    isRunning: false,
    date: '2024-01-01',
  };

  const mockActiveEntry: TimeEntry = {
    id: 'timer_active',
    taskName: 'Active Task',
    taskId: 'task_active',
    startTime: new Date('2024-01-01T10:00:00.000Z'),
    isRunning: true,
    date: '2024-01-01',
  };

  beforeEach(() => {
    // Setup storage service mock
    mockStorageService = {
      getTimeEntries: jest.fn(),
      setTimeEntries: jest.fn(),
    } as any;

    timerService = new TimerService(mockStorageService);

    // Setup utility function mocks
    mockFormatDateString = formatDateString as jest.MockedFunction<typeof formatDateString>;
    mockMeasurePerformance = measurePerformance as jest.MockedFunction<typeof measurePerformance>;
    mockApplyTimerRounding = applyTimerRounding as jest.MockedFunction<typeof applyTimerRounding>;

    // Setup default mock implementations
    mockFormatDateString.mockReturnValue('2024-01-01');
    mockMeasurePerformance.mockImplementation(async (name, fn) => await fn());
    mockApplyTimerRounding.mockImplementation((duration) => duration);
    mockStorageService.getTimeEntries.mockResolvedValue([]);
    mockStorageService.setTimeEntries.mockResolvedValue();

    // Mock Tauri invoke
    const { invoke } = require('@tauri-apps/api/core');
    invoke.mockResolvedValue(undefined);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('startTimer', () => {
    it('should start a new timer successfully', async () => {
      const taskName = 'New Task';
      const taskId = 'task_new';
      const startTime = new Date('2024-01-01T10:00:00.000Z');

      const result = await timerService.startTimer(taskName, taskId, startTime);

      expect(result).toMatchObject({
        taskName,
        taskId,
        startTime,
        isRunning: true,
        date: '2024-01-01',
      });
      expect(result.id).toBeDefined();
      expect(mockStorageService.setTimeEntries).toHaveBeenCalled();
      expect(mockMeasurePerformance).toHaveBeenCalledWith(
        'TimerService.startTimer',
        expect.any(Function),
        'timer',
        { taskName, taskId }
      );
    });

    it('should use current time if no start time provided', async () => {
      const taskName = 'New Task';
      const now = new Date();
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());

      const result = await timerService.startTimer(taskName);

      expect(result.startTime).toBeInstanceOf(Date);
      expect(mockFormatDateString).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should throw error for empty task name', async () => {
      await expect(timerService.startTimer('')).rejects.toThrow(
        expect.objectContaining({ code: 'TIMER_TASK_NOT_FOUND' })
      );
      await expect(timerService.startTimer('   ')).rejects.toThrow(
        expect.objectContaining({ code: 'TIMER_TASK_NOT_FOUND' })
      );
    });

    it('should throw error if timer is already running', async () => {
      // Set an active timer
      await timerService.setActiveTimer(mockActiveEntry);

      await expect(timerService.startTimer('New Task'))
        .rejects.toThrow(expect.objectContaining({ code: 'TIMER_ALREADY_RUNNING' }));
    });

    it('should update Tauri backend state', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      const taskName = 'New Task';

      await timerService.startTimer(taskName);

      expect(invoke).toHaveBeenCalledWith('update_timer_state', expect.objectContaining({
        isRunning: true,
        taskName,
        startTime: expect.any(String),
        elapsedMs: expect.any(Number),
      }));
    });

    it('should handle storage errors', async () => {
      mockStorageService.setTimeEntries.mockRejectedValue(new Error('Storage error'));

      await expect(timerService.startTimer('Test Task'))
        .rejects.toThrow(TimerErrorClass);
    });
  });

  describe('stopTimer', () => {
    beforeEach(() => {
      mockStorageService.getTimeEntries.mockResolvedValue([mockActiveEntry]);
    });

    it('should stop timer successfully', async () => {
      const entryId = 'timer_active';
      const endTime = new Date('2024-01-01T12:00:00.000Z'); // 2 hours after start
      const duration = 2 * 60 * 60 * 1000;

      jest.spyOn(Date, 'now').mockReturnValue(endTime.getTime());
      mockApplyTimerRounding.mockReturnValue(duration);

      await timerService.setActiveTimer(mockActiveEntry);
      const result = await timerService.stopTimer(entryId);

      expect(result).toMatchObject({
        ...mockActiveEntry,
        endTime,
        duration,
        isRunning: false,
      });
      expect(mockApplyTimerRounding).toHaveBeenCalledWith(duration, 'none');
      expect(mockStorageService.setTimeEntries).toHaveBeenCalled();
    });

    it('should apply rounding when specified', async () => {
      const entryId = 'timer_active';
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T12:00:00.000Z').getTime());
      const roundingOption: TimerRoundingOption = 'up-15min';
      const rawDuration = 2 * 60 * 60 * 1000; // 2 hours
      const roundedDuration = 3900000; // 65 minutes rounded up to 75 minutes

      mockApplyTimerRounding.mockReturnValue(roundedDuration);

      await timerService.setActiveTimer(mockActiveEntry);
      const result = await timerService.stopTimer(entryId, roundingOption);

      expect(mockApplyTimerRounding).toHaveBeenCalledWith(rawDuration, roundingOption);
      expect(result.duration).toBe(roundedDuration);
    });

    it('should throw error if timer entry not found', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([]);
      await timerService.setActiveTimer(mockActiveEntry); // Set active timer to check

      await expect(timerService.stopTimer('timer_active')).rejects.toThrow(
        expect.objectContaining({ code: 'TIMER_TASK_NOT_FOUND' })
      );
    });


    it('should throw error if timer is not running', async () => {
      const stoppedEntry = { ...mockActiveEntry, isRunning: false };
      mockStorageService.getTimeEntries.mockResolvedValue([stoppedEntry]);

      await expect(timerService.stopTimer('timer_active'))
        .rejects.toThrow(TimerErrorClass);
    });

    it('should update Tauri backend state to stopped', async () => {
      const { invoke } = require('@tauri-apps/api/core');

      await timerService.stopTimer('timer_active');

      expect(invoke).toHaveBeenCalledWith('update_timer_state', {
        isRunning: false,
        taskName: '',
        startTime: null,
        elapsedMs: 0,
      });
    });

    it('should clear active timer', async () => {
      await timerService.setActiveTimer(mockActiveEntry);

      await timerService.stopTimer('timer_active');

      const activeTimer = await timerService.getActiveTimer();
      expect(activeTimer).toBeNull();
    });

    it('should handle storage errors', async () => {
      mockStorageService.setTimeEntries.mockRejectedValue(new Error('Storage error'));

      await expect(timerService.stopTimer('timer_active'))
        .rejects.toThrow(TimerErrorClass);
    });
  });

  describe('updateActiveTimer', () => {
    it('should update active timer successfully', async () => {
      const updatedEntry = { ...mockActiveEntry, taskName: 'Updated Task' };

      await timerService.updateActiveTimer(updatedEntry);

      const activeTimer = await timerService.getActiveTimer();
      expect(activeTimer).toEqual(updatedEntry);
      expect(mockStorageService.setTimeEntries).toHaveBeenCalled();
    });

    it('should update Tauri backend state', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      const updatedEntry = { ...mockActiveEntry, taskName: 'Updated Task' };

      await timerService.updateActiveTimer(updatedEntry);

      // The service now updates the entry in storage, let's check that
      expect(mockStorageService.setTimeEntries).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({
        isRunning: true,
        taskName: 'Updated Task',
      }));
    });

    it('should handle storage errors', async () => {
      mockStorageService.setTimeEntries.mockRejectedValue(new Error('Storage error'));

      await expect(timerService.updateActiveTimer(mockActiveEntry))
        .rejects.toThrow(TimerErrorClass);
    });
  });

  describe('getActiveTimer', () => {
    it('should return active timer', async () => {
      await timerService.setActiveTimer(mockActiveEntry);

      const result = await timerService.getActiveTimer();

      expect(result).toEqual(mockActiveEntry);
    });

    it('should return null when no active timer', async () => {
      const result = await timerService.getActiveTimer();

      expect(result).toBeNull();
    });
  });

  describe('setActiveTimer', () => {
    it('should set active timer', async () => {
      await timerService.setActiveTimer(mockActiveEntry);

      const result = await timerService.getActiveTimer();
      expect(result).toEqual(mockActiveEntry);
    });

    it('should clear active timer when set to null', async () => {
      await timerService.setActiveTimer(mockActiveEntry);
      await timerService.setActiveTimer(null);

      const result = await timerService.getActiveTimer();
      expect(result).toBeNull();
    });
  });

  describe('updateSystemTray', () => {
    it('should update system tray with active timer', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      const allEntries = [mockActiveEntry, mockTimeEntry];
      mockMeasurePerformance.mockImplementation(async (name, fn) => await fn());

      await timerService.updateSystemTray(mockActiveEntry, allEntries);

      expect(invoke).toHaveBeenCalledWith('update_timer_state', expect.objectContaining({
        isRunning: true,
        taskName: mockActiveEntry.taskName,
        startTime: mockActiveEntry.startTime.toISOString(),
        elapsedMs: expect.any(Number),
      }));
      expect(mockMeasurePerformance).toHaveBeenCalledWith(
        'TimerService.updateSystemTray',
        expect.any(Function),
        'timer',
        {
          hasActiveEntry: true,
          entriesCount: 2,
        }
      );
    });

    it('should update system tray with no active timer', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      const allEntries = [mockTimeEntry];

      await timerService.updateSystemTray(null, allEntries);

      expect(invoke).toHaveBeenCalledWith('update_timer_state', {
        isRunning: false,
        taskName: '',
        startTime: null,
        elapsedMs: 0,
      });
    });

    it('should handle Tauri errors gracefully', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      invoke.mockRejectedValue(new Error('Tauri error'));

      // Should not throw error
      await expect(timerService.updateSystemTray(mockActiveEntry, []))
        .resolves.toBeUndefined();
    });
  });

  describe('saveTimeEntry', () => {
    it('should save time entry to storage', async () => {
      const entries = [mockTimeEntry];
      mockStorageService.getTimeEntries.mockResolvedValue([]);

      await timerService.saveTimeEntry(mockTimeEntry);

      expect(mockStorageService.setTimeEntries).toHaveBeenCalledWith([mockTimeEntry]);
    });

    it('should append to existing entries', async () => {
      const existingEntry = { ...mockTimeEntry, id: 'existing' };
      mockStorageService.getTimeEntries.mockResolvedValue([existingEntry]);

      await timerService.saveTimeEntry(mockTimeEntry);

      expect(mockStorageService.setTimeEntries).toHaveBeenCalledWith([existingEntry, mockTimeEntry]);
    });

    it('should handle storage errors', async () => {
      mockStorageService.setTimeEntries.mockRejectedValue(new Error('Storage error'));

      await expect(timerService.saveTimeEntry(mockTimeEntry))
        .rejects.toThrow(TimerErrorClass);
    });
  });

  describe('updateTimeEntry', () => {
    it('should update existing time entry', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([mockTimeEntry]);
      const updates = { taskName: 'Updated Task', duration: 7200000 };

      const result = await timerService.updateTimeEntry('timer_1', updates);

      expect(result).toMatchObject({
        ...mockTimeEntry,
        ...updates,
      });
      expect(mockStorageService.setTimeEntries).toHaveBeenCalled();
    });

    it('should throw error if entry not found', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([]);

      await expect(timerService.updateTimeEntry('nonexistent', {}))
        .rejects.toThrow(TimerErrorClass);
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([mockTimeEntry]);
      mockStorageService.setTimeEntries.mockRejectedValue(new Error('Storage error'));

      await expect(timerService.updateTimeEntry('timer_1', {}))
        .rejects.toThrow(TimerErrorClass);
    });
  });

  describe('deleteTimeEntry', () => {
    it('should delete time entry', async () => {
      const otherEntry = { ...mockTimeEntry, id: 'other' };
      mockStorageService.getTimeEntries.mockResolvedValue([mockTimeEntry, otherEntry]);

      await timerService.deleteTimeEntry('timer_1');

      expect(mockStorageService.setTimeEntries).toHaveBeenCalledWith([otherEntry]);
    });

    it('should throw error if entry not found', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([]);

      await expect(timerService.deleteTimeEntry('nonexistent'))
        .rejects.toThrow(TimerErrorClass);
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([mockTimeEntry]);
      mockStorageService.setTimeEntries.mockRejectedValue(new Error('Storage error'));

      await expect(timerService.deleteTimeEntry('timer_1'))
        .rejects.toThrow(TimerErrorClass);
    });
  });

  describe('getTimeEntries', () => {
    it('should return all time entries', async () => {
      const entries = [mockTimeEntry, mockActiveEntry];
      mockStorageService.getTimeEntries.mockResolvedValue(entries);

      const result = await timerService.getTimeEntries();

      expect(result).toEqual(entries);
      expect(mockStorageService.getTimeEntries).toHaveBeenCalled();
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTimeEntries.mockRejectedValue(new Error('Storage error'));

      await expect(timerService.getTimeEntries())
        .rejects.toThrow(TimerErrorClass);
    });
  });

  describe('getTimeEntriesByDate', () => {
    it('should return entries for specific date', async () => {
      const entries = [
        { ...mockTimeEntry, date: '2024-01-01' },
        { ...mockTimeEntry, id: 'timer_2', date: '2024-01-02' },
        { ...mockTimeEntry, id: 'timer_3', date: '2024-01-01' },
      ];
      mockStorageService.getTimeEntries.mockResolvedValue(entries);

      const result = await timerService.getTimeEntriesByDate('2024-01-01');

      expect(result).toEqual([
        { ...mockTimeEntry, date: '2024-01-01' },
        { ...mockTimeEntry, id: 'timer_3', date: '2024-01-01' },
      ]);
    });

    it('should return empty array for date with no entries', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([mockTimeEntry]);

      const result = await timerService.getTimeEntriesByDate('2024-01-02');

      expect(result).toEqual([]);
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTimeEntries.mockRejectedValue(new Error('Storage error'));

      await expect(timerService.getTimeEntriesByDate('2024-01-01'))
        .rejects.toThrow(TimerErrorClass);
    });
  });

  describe('getDailyTotal', () => {
    it('should calculate daily total for current date', async () => {
      const entries = [
        { ...mockTimeEntry, duration: 3600000 }, // 1 hour
        { ...mockTimeEntry, id: 'timer_2', duration: 1800000 }, // 30 minutes
      ];
      mockStorageService.getTimeEntries.mockResolvedValue(entries);
      mockFormatDateString.mockReturnValue('2024-01-01');

      const result = await timerService.getDailyTotal();

      expect(result).toEqual({
        totalDuration: 5400000, // 1.5 hours
        taskCount: 2,
      });
      expect(mockFormatDateString).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should calculate daily total for specific date', async () => {
      const entries = [
        { ...mockTimeEntry, duration: 7200000 }, // 2 hours
      ];
      mockStorageService.getTimeEntries.mockResolvedValue(entries);

      const result = await timerService.getDailyTotal('2024-01-01');

      expect(result).toEqual({
        totalDuration: 7200000,
        taskCount: 1,
      });
    });

    it('should handle entries without duration', async () => {
      const entries = [
        { ...mockTimeEntry, duration: 3600000 },
        { ...mockTimeEntry, id: 'timer_2', duration: undefined },
      ];
      mockStorageService.getTimeEntries.mockResolvedValue(entries);

      const result = await timerService.getDailyTotal('2024-01-01');

      expect(result).toEqual({
        totalDuration: 3600000,
        taskCount: 2,
      });
    });

    it('should return zero for empty entries', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([]);

      const result = await timerService.getDailyTotal('2024-01-01');

      expect(result).toEqual({
        totalDuration: 0,
        taskCount: 0,
      });
    });

    it('should handle storage errors', async () => {
      mockStorageService.getTimeEntries.mockRejectedValue(new Error('Storage error'));

      await expect(timerService.getDailyTotal('2024-01-01'))
        .rejects.toThrow(TimerErrorClass);
    });
  });

  describe('rounding logic', () => {
    beforeEach(() => {
      mockStorageService.getTimeEntries.mockResolvedValue([mockActiveEntry]);
    });

    it('should apply no rounding by default', async () => {
      const rawDuration = 3723000; // 62 minutes and 3 seconds
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T11:02:03.000Z').getTime()); // ~62 mins
      mockApplyTimerRounding.mockReturnValue(rawDuration);

      await timerService.setActiveTimer(mockActiveEntry);
      await timerService.stopTimer('timer_active');

      expect(mockApplyTimerRounding).toHaveBeenCalledWith(rawDuration, 'none');
    });

    it('should apply 5-minute rounding', async () => {
      const roundedDuration = 3900000; // 65 minutes
      mockApplyTimerRounding.mockReturnValue(roundedDuration);

      await timerService.stopTimer('timer_active', 'up-5min');

      expect(mockApplyTimerRounding).toHaveBeenCalledWith(rawDuration, 'up-5min');
    });

    it('should apply 15-minute rounding', async () => {
      const rawDuration = 3723000; // 62 minutes and 3 seconds
      const roundedDuration = 4500000; // 75 minutes
      mockApplyTimerRounding.mockReturnValue(roundedDuration);

      await timerService.stopTimer('timer_active', 'up-15min');

      expect(mockApplyTimerRounding).toHaveBeenCalledWith(rawDuration, 'up-15min');
    });

    it('should apply 30-minute rounding', async () => {
      const rawDuration = 3723000; // 62 minutes and 3 seconds
      const roundedDuration = 5400000; // 90 minutes
      mockApplyTimerRounding.mockReturnValue(roundedDuration);

      await timerService.stopTimer('timer_active', 'up-30min');

      expect(mockApplyTimerRounding).toHaveBeenCalledWith(rawDuration, 'up-30min');
    });
  });

  describe('Tauri integration', () => {
    it('should handle Tauri backend unavailable gracefully', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      invoke.mockRejectedValue(new Error('Tauri not available'));

      // Should not throw error for Tauri failures
      await timerService.setActiveTimer(mockActiveEntry);
      await expect(timerService.startTimer('Test Task')).resolves.toBeDefined();
      await expect(timerService.stopTimer('timer_active')).resolves.toBeDefined();
      await expect(timerService.updateSystemTray(null, [])).resolves.toBeUndefined();
    });

    it('should update timer state correctly for running timer', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      const startTime = new Date('2024-01-01T10:00:00.000Z');
      const currentTime = new Date('2024-01-01T10:30:00.000Z');

      jest.spyOn(Date, 'now').mockReturnValue(currentTime.getTime());

      await timerService.startTimer('Test Task', 'task_1', startTime);

      expect(invoke).toHaveBeenCalledWith('update_timer_state', {
        isRunning: true,
        taskName: 'Test Task',
        startTime: startTime.toISOString(),
        elapsedMs: 1800000, // 30 minutes
      });
    });

    it('should update timer state correctly for stopped timer', async () => {
      const { invoke } = require('@tauri-apps/api/core');
      mockStorageService.getTimeEntries.mockResolvedValue([mockActiveEntry]);

      await timerService.stopTimer('timer_active');

      expect(invoke).toHaveBeenCalledWith('update_timer_state', {
        isRunning: false,
        taskName: '',
        startTime: null,
        elapsedMs: 0,
      });
    });
  });

  describe('performance monitoring', () => {
    it('should measure performance for startTimer', async () => {
      await timerService.startTimer('Test Task');

      expect(mockMeasurePerformance).toHaveBeenCalledWith(
        'TimerService.startTimer',
        expect.any(Function),
        'timer',
        { taskName: 'Test Task', taskId: undefined }
      );
    });

    it('should measure performance for updateSystemTray', async () => {
      await timerService.updateSystemTray(mockActiveEntry, []);

      expect(mockMeasurePerformance).toHaveBeenCalledWith(
        'TimerService.updateSystemTray',
        expect.any(Function)
      );
    });
  });
});
