/**
 * Tests for MigrationService
 * 
 * Tests data migration from old timer system to new session-based system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MigrationService } from '../MigrationService';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { TaskNote } from '../../types/notes';

// Mock StorageService
const mockStorageService = {
  getTimeEntries: vi.fn(),
  getTaskSessions: vi.fn(),
  getTasks: vi.fn(),
  getTaskNotes: vi.fn(),
  setTaskSessions: vi.fn(),
  setTaskNotes: vi.fn(),
  createBackup: vi.fn(),
};

vi.mock('../StorageService', () => ({
  StorageService: {
    getInstance: () => mockStorageService,
  },
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
});

describe('MigrationService', () => {
  let migrationService: MigrationService;

  const mockTimeEntries: TimeEntry[] = [
    {
      id: 'entry-1',
      taskName: 'Test Task',
      date: '2024-01-15T10:00:00Z',
      duration: 3600000, // 1 hour
      description: 'First work session',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T11:00:00Z',
    },
    {
      id: 'entry-2',
      taskName: 'Test Task',
      date: '2024-01-15T14:00:00Z',
      duration: 1800000, // 30 minutes
      description: 'Second work session',
      createdAt: '2024-01-15T14:00:00Z',
      updatedAt: '2024-01-15T14:30:00Z',
    },
    {
      id: 'entry-3',
      taskName: 'Another Task',
      date: '2024-01-16T09:00:00Z',
      duration: 7200000, // 2 hours
      description: 'Different task work',
      createdAt: '2024-01-16T09:00:00Z',
      updatedAt: '2024-01-16T11:00:00Z',
    },
  ];

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Test Task',
      description: 'A test task',
      createdAt: '2024-01-15T09:00:00Z',
      updatedAt: '2024-01-15T09:00:00Z',
    },
    {
      id: 'task-2',
      name: 'Another Task',
      description: 'Another test task',
      createdAt: '2024-01-16T08:00:00Z',
      updatedAt: '2024-01-16T08:00:00Z',
    },
  ];

  const mockNotes: TaskNote[] = [
    {
      id: 'note-1',
      taskId: 'task-1',
      templateId: 'template-1',
      templateName: 'Work Notes',
      fieldValues: { notes: 'Some work notes' },
      timeEntryId: 'entry-1',
      noteLevel: 'task',
      isArchived: false,
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-15T10:30:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    migrationService = new MigrationService();
    
    // Default mock implementations
    mockStorageService.getTimeEntries.mockResolvedValue([]);
    mockStorageService.getTaskSessions.mockResolvedValue([]);
    mockStorageService.getTasks.mockResolvedValue([]);
    mockStorageService.getTaskNotes.mockResolvedValue([]);
    mockStorageService.setTaskSessions.mockResolvedValue(undefined);
    mockStorageService.setTaskNotes.mockResolvedValue(undefined);
    mockStorageService.createBackup.mockResolvedValue(undefined);
    
    mockLocalStorage.getItem.mockReturnValue(null);
    mockLocalStorage.setItem.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('needsMigration', () => {
    it('should return true when time entries exist but no sessions', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue(mockTimeEntries);
      mockStorageService.getTaskSessions.mockResolvedValue([]);

      const needsMigration = await migrationService.needsMigration();

      expect(needsMigration).toBe(true);
    });

    it('should return false when no time entries exist', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([]);
      mockStorageService.getTaskSessions.mockResolvedValue([]);

      const needsMigration = await migrationService.needsMigration();

      expect(needsMigration).toBe(false);
    });

    it('should return false when sessions already exist', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue(mockTimeEntries);
      mockStorageService.getTaskSessions.mockResolvedValue([{ id: 'session-1' }]);

      const needsMigration = await migrationService.needsMigration();

      expect(needsMigration).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockStorageService.getTimeEntries.mockRejectedValue(new Error('Storage error'));

      const needsMigration = await migrationService.needsMigration();

      expect(needsMigration).toBe(false);
    });
  });

  describe('migrateToSessions', () => {
    beforeEach(() => {
      mockStorageService.getTimeEntries.mockResolvedValue(mockTimeEntries);
      mockStorageService.getTasks.mockResolvedValue(mockTasks);
      mockStorageService.getTaskNotes.mockResolvedValue(mockNotes);
    });

    it('should successfully migrate time entries to sessions', async () => {
      const result = await migrationService.migrateToSessions();

      expect(result.success).toBe(true);
      expect(result.migratedSessions).toBeGreaterThan(0);
      expect(result.migratedInstances).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should create backup when requested', async () => {
      await migrationService.migrateToSessions({
        preserveOriginalData: true,
        createBackup: true,
        groupByDate: true,
        minimumDurationMs: 60000,
      });

      expect(mockStorageService.createBackup).toHaveBeenCalled();
    });

    it('should skip backup when not requested', async () => {
      await migrationService.migrateToSessions({
        preserveOriginalData: true,
        createBackup: false,
        groupByDate: true,
        minimumDurationMs: 60000,
      });

      expect(mockStorageService.createBackup).not.toHaveBeenCalled();
    });

    it('should group entries by date when enabled', async () => {
      const result = await migrationService.migrateToSessions({
        preserveOriginalData: true,
        createBackup: false,
        groupByDate: true,
        minimumDurationMs: 60000,
      });

      // Should create separate sessions for same task on different dates
      expect(result.migratedSessions).toBe(2); // Test Task on 2024-01-15, Another Task on 2024-01-16
    });

    it('should group entries by task only when date grouping disabled', async () => {
      const result = await migrationService.migrateToSessions({
        preserveOriginalData: true,
        createBackup: false,
        groupByDate: false,
        minimumDurationMs: 60000,
      });

      // Should create one session per unique task
      expect(result.migratedSessions).toBe(2); // Test Task, Another Task
    });

    it('should filter out entries below minimum duration', async () => {
      const shortEntry: TimeEntry = {
        id: 'short-entry',
        taskName: 'Short Task',
        date: '2024-01-17T10:00:00Z',
        duration: 30000, // 30 seconds
        description: 'Very short work',
        createdAt: '2024-01-17T10:00:00Z',
        updatedAt: '2024-01-17T10:00:30Z',
      };

      mockStorageService.getTimeEntries.mockResolvedValue([...mockTimeEntries, shortEntry]);

      const result = await migrationService.migrateToSessions({
        preserveOriginalData: true,
        createBackup: false,
        groupByDate: true,
        minimumDurationMs: 60000, // 1 minute minimum
      });

      // Short entry should be filtered out
      expect(result.migratedInstances).toBe(3); // Only the 3 original entries
    });

    it('should migrate associated notes', async () => {
      const result = await migrationService.migrateToSessions();

      expect(result.migratedNotes).toBe(1);
      expect(mockStorageService.setTaskNotes).toHaveBeenCalled();
    });

    it('should handle empty time entries gracefully', async () => {
      mockStorageService.getTimeEntries.mockResolvedValue([]);

      const result = await migrationService.migrateToSessions();

      expect(result.success).toBe(true);
      expect(result.migratedSessions).toBe(0);
      expect(result.warnings).toContain('No time entries found to migrate');
    });

    it('should handle migration errors', async () => {
      mockStorageService.setTaskSessions.mockRejectedValue(new Error('Save failed'));

      const result = await migrationService.migrateToSessions();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should create proper session structure', async () => {
      await migrationService.migrateToSessions();

      const savedSessions = mockStorageService.setTaskSessions.mock.calls[0][0];
      
      expect(savedSessions).toBeInstanceOf(Array);
      expect(savedSessions.length).toBeGreaterThan(0);
      
      const session = savedSessions[0];
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('taskId');
      expect(session).toHaveProperty('taskName');
      expect(session).toHaveProperty('timerInstances');
      expect(session).toHaveProperty('totalDuration');
      expect(session).toHaveProperty('isActive', false);
      expect(session).toHaveProperty('date');
      expect(session).toHaveProperty('createdAt');
      expect(session).toHaveProperty('updatedAt');
    });

    it('should create proper timer instance structure', async () => {
      await migrationService.migrateToSessions();

      const savedSessions = mockStorageService.setTaskSessions.mock.calls[0][0];
      const session = savedSessions[0];
      const instance = session.timerInstances[0];

      expect(instance).toHaveProperty('id');
      expect(instance).toHaveProperty('sessionId', session.id);
      expect(instance).toHaveProperty('startTime');
      expect(instance).toHaveProperty('endTime');
      expect(instance).toHaveProperty('duration');
      expect(instance).toHaveProperty('isRunning', false);
      expect(instance).toHaveProperty('isPaused', false);
      expect(instance).toHaveProperty('createdAt');
      expect(instance).toHaveProperty('updatedAt');
    });

    it('should calculate correct session totals', async () => {
      await migrationService.migrateToSessions({
        preserveOriginalData: true,
        createBackup: false,
        groupByDate: true,
        minimumDurationMs: 60000,
      });

      const savedSessions = mockStorageService.setTaskSessions.mock.calls[0][0];
      const testTaskSession = savedSessions.find((s: any) => s.taskName === 'Test Task');

      // Test Task has 2 entries: 1 hour + 30 minutes = 1.5 hours
      expect(testTaskSession.totalDuration).toBe(5400000); // 1.5 hours in milliseconds
      expect(testTaskSession.timerInstances).toHaveLength(2);
    });
  });

  describe('migration completion tracking', () => {
    it('should mark migration as complete', async () => {
      // Set up some time entries to migrate
      mockStorageService.getTimeEntries.mockResolvedValue(mockTimeEntries);
      mockStorageService.getTasks.mockResolvedValue(mockTasks);

      await migrationService.migrateToSessions();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'session_migration_info',
        expect.stringContaining('"completed":true')
      );
    });

    it('should check if migration is complete', async () => {
      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify({ completed: true, completedAt: '2024-01-15T12:00:00Z' })
      );

      const isComplete = await migrationService.isMigrationComplete();

      expect(isComplete).toBe(true);
    });

    it('should return false when migration not complete', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const isComplete = await migrationService.isMigrationComplete();

      expect(isComplete).toBe(false);
    });

    it('should handle corrupted migration info', async () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const isComplete = await migrationService.isMigrationComplete();

      expect(isComplete).toBe(false);
    });

    it('should reset migration status', async () => {
      await migrationService.resetMigrationStatus();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('session_migration_info');
    });
  });

  describe('edge cases', () => {
    it('should handle entries with missing task names', async () => {
      const entriesWithMissingNames = [
        {
          ...mockTimeEntries[0],
          taskName: '',
        },
        {
          ...mockTimeEntries[1],
          taskName: undefined as any,
        },
      ];

      mockStorageService.getTimeEntries.mockResolvedValue(entriesWithMissingNames);

      const result = await migrationService.migrateToSessions();

      expect(result.success).toBe(true);
      
      const savedSessions = mockStorageService.setTaskSessions.mock.calls[0][0];
      expect(savedSessions[0].taskName).toBe('Unknown Task');
    });

    it('should handle entries with zero duration', async () => {
      const zeroEntries = [
        {
          ...mockTimeEntries[0],
          duration: 0,
        },
      ];

      mockStorageService.getTimeEntries.mockResolvedValue(zeroEntries);

      const result = await migrationService.migrateToSessions();

      // Should create session but no timer instances
      expect(result.migratedSessions).toBe(1);
      expect(result.migratedInstances).toBe(0);
    });

    it('should handle missing timestamps gracefully', async () => {
      const entriesWithMissingTimestamps = [
        {
          ...mockTimeEntries[0],
          createdAt: undefined as any,
          updatedAt: undefined as any,
        },
      ];

      mockStorageService.getTimeEntries.mockResolvedValue(entriesWithMissingTimestamps);

      const result = await migrationService.migrateToSessions();

      expect(result.success).toBe(true);
    });

    it('should handle backup creation failure', async () => {
      mockStorageService.createBackup.mockRejectedValue(new Error('Backup failed'));

      const result = await migrationService.migrateToSessions({
        preserveOriginalData: true,
        createBackup: true,
        groupByDate: true,
        minimumDurationMs: 60000,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Migration failed: Failed to create backup before migration');
    });
  });
});
