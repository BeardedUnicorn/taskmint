/**
 * Timer Service
 * 
 * Centralized timer business logic with Tauri integration
 * Handles timer state management, system tray updates, and data persistence
 */

import { invoke } from '@tauri-apps/api/core';
import { TimeEntry, TimerRoundingOption } from '../types/timer';

import { IStorageService } from './StorageService';
import { createTimerError, TimerErrorClass } from '../types/errors';
import { formatDateString } from '../utils/dateHelpers';
import { measurePerformance } from '../utils/performance';
import { applyTimerRounding } from '../utils/formatters';

export interface ITimerService {
  // Timer operations
  startTimer(taskName: string, taskId?: string, startTime?: Date): Promise<TimeEntry>;
  stopTimer(entryId: string, roundingOption?: TimerRoundingOption): Promise<TimeEntry>;
  updateActiveTimer(entry: TimeEntry): Promise<void>;

  // Timer state management
  getActiveTimer(): Promise<TimeEntry | null>;
  setActiveTimer(entry: TimeEntry | null): Promise<void>;

  // System tray integration
  updateSystemTray(activeEntry: TimeEntry | null, allEntries: TimeEntry[]): Promise<void>;

  // Data operations
  saveTimeEntry(entry: TimeEntry): Promise<void>;
  updateTimeEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(entryId: string): Promise<void>;
  getTimeEntries(): Promise<TimeEntry[]>;
  getTimeEntriesByDate(date: string): Promise<TimeEntry[]>;

  // Daily totals
  getDailyTotal(date?: string): Promise<{ totalDuration: number; taskCount: number }>;
}

export class TimerService implements ITimerService {
  private storageService: IStorageService;
  private activeTimer: TimeEntry | null = null;

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
  }

  /**
   * Start a new timer
   */
  async startTimer(
    taskName: string,
    taskId?: string,
    startTime?: Date
  ): Promise<TimeEntry> {
    return measurePerformance(
      'TimerService.startTimer',
      async () => {
        try {
      // Validate input
      if (!taskName.trim()) {
        throw createTimerError(
          'TIMER_TASK_NOT_FOUND',
          'Task name cannot be empty',
          { taskName },
          'startTimer'
        );
      }

      // Check if there's already an active timer
      if (this.activeTimer && this.activeTimer.isRunning) {
        throw createTimerError(
          'TIMER_ALREADY_RUNNING',
          'A timer is already running. Stop the current timer before starting a new one.',
          { activeTimer: this.activeTimer },
          'startTimer'
        );
      }

      const now = startTime || new Date();
      const newEntry: TimeEntry = {
        id: `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        taskName: taskName.trim(),
        taskId,
        startTime: now,
        isRunning: true,
        date: formatDateString(now),
      };

      // Update Tauri backend state
      await this.updateTauriTimerState(newEntry);

      // Set as active timer
      this.activeTimer = newEntry;

      // Save to storage
      await this.saveTimeEntry(newEntry);

          console.log('Timer started successfully:', newEntry);
          return newEntry;
        } catch (error) {
          if (error instanceof TimerErrorClass) {
            throw error;
          }

          console.error('Failed to start timer:', error);
          throw createTimerError(
            'TIMER_START_FAILED',
            'Failed to start timer',
            { originalError: error, taskName, taskId },
            'startTimer'
          );
        }
      },
      'timer',
      { taskName, taskId }
    );
  }

  /**
   * Stop an active timer
   */
  async stopTimer(entryId: string, roundingOption: TimerRoundingOption = 'none'): Promise<TimeEntry> {
    try {
      const entries = await this.getTimeEntries();
      const entry = entries.find(e => e.id === entryId);

      if (!entry) {
        throw createTimerError(
          'TIMER_TASK_NOT_FOUND',
          `Timer entry with ID ${entryId} not found`,
          { entryId },
          'stopTimer'
        );
      }

      if (!entry.isRunning) {
        throw createTimerError(
          'TIMER_NOT_RUNNING',
          'Timer is not currently running',
          { entry },
          'stopTimer'
        );
      }

      const now = new Date();
      const rawDuration = now.getTime() - entry.startTime.getTime();

      // Apply rounding if specified
      const duration = applyTimerRounding(rawDuration, roundingOption);

      const updatedEntry: TimeEntry = {
        ...entry,
        endTime: now,
        duration,
        isRunning: false,
      };

      // Update Tauri backend state
      await this.updateTauriTimerState(null);

      // Clear active timer
      this.activeTimer = null;

      // Update entry in storage
      await this.updateTimeEntry(entryId, {
        endTime: now,
        duration,
        isRunning: false,
      });

      console.log('Timer stopped successfully:', updatedEntry);
      return updatedEntry;
    } catch (error) {
      if (error instanceof TimerErrorClass) {
        throw error;
      }

      console.error('Failed to stop timer:', error);
      throw createTimerError(
        'TIMER_STOP_FAILED',
        'Failed to stop timer',
        { originalError: error, entryId },
        'stopTimer'
      );
    }
  }

  /**
   * Update active timer state
   */
  async updateActiveTimer(entry: TimeEntry): Promise<void> {
    try {
      this.activeTimer = entry;
      await this.updateTauriTimerState(entry);
      await this.updateTimeEntry(entry.id, entry);
    } catch (error) {
      console.error('Failed to update active timer:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to update active timer',
        { originalError: error, entry },
        'updateActiveTimer'
      );
    }
  }

  /**
   * Get current active timer
   */
  async getActiveTimer(): Promise<TimeEntry | null> {
    return this.activeTimer;
  }

  /**
   * Set active timer
   */
  async setActiveTimer(entry: TimeEntry | null): Promise<void> {
    this.activeTimer = entry;
  }

  /**
   * Update system tray with current timer state
   */
  async updateSystemTray(
    activeEntry: TimeEntry | null,
    allEntries: TimeEntry[]
  ): Promise<void> {
    return measurePerformance(
      'TimerService.updateSystemTray',
      async () => {
        try {
      // Update timer state in Tauri backend
      if (activeEntry && activeEntry.isRunning) {
        await invoke('update_timer_state', {
          isRunning: true,
          taskName: activeEntry.taskName,
          startTime: activeEntry.startTime.toISOString(),
          elapsedMs: Date.now() - activeEntry.startTime.getTime(),
        });
      } else {
        await invoke('update_timer_state', {
          isRunning: false,
          taskName: '',
          startTime: null,
          elapsedMs: 0,
        });
      }

      // Update tray menu with daily totals
      const timeEntriesData = allEntries.map(entry => ({
        date: entry.date,
        duration: entry.duration || 0,
        isRunning: entry.isRunning,
        taskName: entry.taskName,
      }));

          await invoke('update_tray_menu_command', {
            timeEntries: timeEntriesData,
          });
        } catch (error) {
          console.error('Failed to update system tray:', error);
          // Don't throw error for system tray updates to avoid breaking main functionality
        }
      },
      'timer',
      { hasActiveEntry: !!activeEntry, entriesCount: allEntries.length }
    );
  }

  /**
   * Save time entry to storage
   */
  async saveTimeEntry(entry: TimeEntry): Promise<void> {
    try {
      const entries = await this.getTimeEntries();
      const existingIndex = entries.findIndex(e => e.id === entry.id);
      
      if (existingIndex >= 0) {
        entries[existingIndex] = entry;
      } else {
        entries.push(entry);
      }
      
      await this.storageService.setTimeEntries(entries);
    } catch (error) {
      console.error('Failed to save time entry:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to save time entry',
        { originalError: error, entry },
        'saveTimeEntry'
      );
    }
  }

  /**
   * Update existing time entry
   */
  async updateTimeEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry> {
    try {
      const entries = await this.getTimeEntries();
      const entryIndex = entries.findIndex(e => e.id === entryId);
      
      if (entryIndex === -1) {
        throw createTimerError(
          'TIMER_TASK_NOT_FOUND',
          `Time entry with ID ${entryId} not found`,
          { entryId },
          'updateTimeEntry'
        );
      }

      const updatedEntry = { ...entries[entryIndex], ...updates };
      entries[entryIndex] = updatedEntry;
      
      await this.storageService.setTimeEntries(entries);
      return updatedEntry;
    } catch (error) {
      if (error instanceof TimerErrorClass) {
        throw error;
      }
      
      console.error('Failed to update time entry:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to update time entry',
        { originalError: error, entryId, updates },
        'updateTimeEntry'
      );
    }
  }

  /**
   * Delete time entry
   */
  async deleteTimeEntry(entryId: string): Promise<void> {
    try {
      const entries = await this.getTimeEntries();
      const filteredEntries = entries.filter(e => e.id !== entryId);
      
      if (filteredEntries.length === entries.length) {
        throw createTimerError(
          'TIMER_TASK_NOT_FOUND',
          `Time entry with ID ${entryId} not found`,
          { entryId },
          'deleteTimeEntry'
        );
      }
      
      await this.storageService.setTimeEntries(filteredEntries);
    } catch (error) {
      if (error instanceof TimerErrorClass) {
        throw error;
      }
      
      console.error('Failed to delete time entry:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to delete time entry',
        { originalError: error, entryId },
        'deleteTimeEntry'
      );
    }
  }

  /**
   * Get all time entries
   */
  async getTimeEntries(): Promise<TimeEntry[]> {
    try {
      return await this.storageService.getTimeEntries();
    } catch (error) {
      console.error('Failed to get time entries:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to retrieve time entries',
        { originalError: error },
        'getTimeEntries'
      );
    }
  }

  /**
   * Get time entries for a specific date
   */
  async getTimeEntriesByDate(date: string): Promise<TimeEntry[]> {
    try {
      const entries = await this.getTimeEntries();
      return entries.filter(entry => entry.date === date);
    } catch (error) {
      console.error('Failed to get time entries by date:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to retrieve time entries for date',
        { originalError: error, date },
        'getTimeEntriesByDate'
      );
    }
  }

  /**
   * Get daily total duration and task count
   */
  async getDailyTotal(date?: string): Promise<{ totalDuration: number; taskCount: number }> {
    try {
      const targetDate = date || formatDateString(new Date());
      const entries = await this.getTimeEntriesByDate(targetDate);
      
      const totalDuration = entries.reduce((total, entry) => {
        return total + (entry.duration || 0);
      }, 0);
      
      return {
        totalDuration,
        taskCount: entries.length,
      };
    } catch (error) {
      console.error('Failed to get daily total:', error);
      throw createTimerError(
        'TIMER_SYNC_FAILED',
        'Failed to calculate daily total',
        { originalError: error, date },
        'getDailyTotal'
      );
    }
  }

  /**
   * Update Tauri backend timer state
   */
  private async updateTauriTimerState(entry: TimeEntry | null): Promise<void> {
    try {
      if (entry && entry.isRunning) {
        await invoke('update_timer_state', {
          isRunning: true,
          taskName: entry.taskName,
          startTime: entry.startTime.toISOString(),
          elapsedMs: Date.now() - entry.startTime.getTime(),
        });
      } else {
        await invoke('update_timer_state', {
          isRunning: false,
          taskName: '',
          startTime: null,
          elapsedMs: 0,
        });
      }
    } catch (error) {
      console.error('Failed to update Tauri timer state:', error);
      // Don't throw error for Tauri updates to avoid breaking main functionality
    }
  }
}
