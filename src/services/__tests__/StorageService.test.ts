/**
 * Tests for StorageService
 */

import { StorageService } from '../StorageService';
import { z } from 'zod';
import { TimeEntrySchema } from '../../types/timer';
import { TaskSchema } from '../../types/task';
import { DailyGoalSchema } from '../../types/goal';
import { StorageErrorClass } from '../../types/errors';

// Mock dependencies
jest.mock('../../utils/dataMigration', () => ({
  migrateData: jest.fn(),
  createBackup: jest.fn(),
  needsMigration: jest.fn(),
}));

jest.mock('../../utils/validation', () => ({
  validateWithSchema: jest.fn(),
}));

jest.mock('../../constants', () => ({
  STORAGE_KEYS: {
    TIME_ENTRIES: 'timeEntries',
    PREDEFINED_TASKS: 'predefinedTasks',
    NOTE_TEMPLATES: 'noteTemplates',
    TASK_NOTES: 'taskNotes',
    DAILY_GOAL: 'dailyGoal',
    DAILY_GOAL_ACHIEVEMENTS: 'dailyGoalAchievements',
  },
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

// Mock global localStorage
Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('StorageService', () => {
  let storageService: StorageService;
  const { migrateData, createBackup, needsMigration } = require('../../utils/dataMigration');
  const { validateWithSchema } = require('../../utils/validation');

  beforeEach(() => {
    // Reset singleton instance
    (StorageService as any).instance = undefined;
    storageService = StorageService.getInstance();
    
    // Clear all mocks
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    mockLocalStorage.clear.mockClear();
    
    // Reset mock implementations
    needsMigration.mockReturnValue(false);
    validateWithSchema.mockReturnValue({ success: true, data: null });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = StorageService.getInstance();
      const instance2 = StorageService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getItem', () => {
    it('should return default value when key is not found', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      
      const result = await storageService.getItem('nonexistent', 'default');
      
      expect(result).toBe('default');
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('nonexistent');
    });

    it('should return parsed data when key exists', async () => {
      const testData = { test: 'value' };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(testData));
      
      const result = await storageService.getItem('test', {});
      
      expect(result).toEqual(testData);
    });

    it('should validate data with schema when provided', async () => {
      const testData = { name: 'test' };
      const schema = z.object({ name: z.string() });
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(testData));
      validateWithSchema.mockReturnValue({ success: true, data: testData });
      
      const result = await storageService.getItem('test', {}, schema);
      
      expect(validateWithSchema).toHaveBeenCalledWith(schema, testData);
      expect(result).toEqual(testData);
    });

    it('should throw error when validation fails', async () => {
      const testData = { invalid: 'data' };
      const schema = z.object({ name: z.string() });
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(testData));
      validateWithSchema.mockReturnValue({ 
        success: false, 
        error: 'Validation failed' 
      });
      
      await expect(storageService.getItem('test', {}, schema))
        .rejects.toThrow(StorageErrorClass);
    });

    it('should handle migration when needed', async () => {
      const oldData = { version: 1, data: 'old' };
      const migratedData = { version: 2, data: 'new' };
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(oldData));
      needsMigration.mockReturnValue(true);
      migrateData.mockReturnValue(migratedData);
      
      const result = await storageService.getItem('test', 'default');
      
      expect(needsMigration).toHaveBeenCalledWith(oldData);
      expect(createBackup).toHaveBeenCalledWith('test');
      expect(migrateData).toHaveBeenCalledWith('test', oldData);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('test', JSON.stringify(migratedData));
      expect(result).toBe('new');
    });

    it('should extract data from versioned structure', async () => {
      const versionedData = { version: 2, data: 'extracted' };
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(versionedData));
      needsMigration.mockReturnValue(false);
      
      const result = await storageService.getItem('test', 'default');
      
      expect(result).toBe('extracted');
    });

    it('should handle JSON parse errors', async () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');
      
      await expect(storageService.getItem('test', 'default'))
        .rejects.toThrow(StorageErrorClass);
    });

    it('should not migrate null values', async () => {
      mockLocalStorage.getItem.mockReturnValue('null');
      
      const result = await storageService.getItem('test', 'default');
      
      expect(needsMigration).not.toHaveBeenCalled();
      expect(result).toBe(null);
    });
  });

  describe('setItem', () => {
    it('should store data in localStorage', async () => {
      const testData = { test: 'value' };
      
      await storageService.setItem('test', testData);
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('test', JSON.stringify(testData));
    });

    it('should validate data with schema when provided', async () => {
      const testData = { name: 'test' };
      const schema = z.object({ name: z.string() });
      
      validateWithSchema.mockReturnValue({ success: true, data: testData });
      
      await storageService.setItem('test', testData, schema);
      
      expect(validateWithSchema).toHaveBeenCalledWith(schema, testData);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('test', JSON.stringify(testData));
    });

    it('should throw error when validation fails', async () => {
      const testData = { invalid: 'data' };
      const schema = z.object({ name: z.string() });
      
      validateWithSchema.mockReturnValue({ 
        success: false, 
        error: 'Validation failed' 
      });
      
      await expect(storageService.setItem('test', testData, schema))
        .rejects.toThrow(StorageErrorClass);
      
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    });

    it('should handle localStorage write errors', async () => {
      const testData = { test: 'value' };
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });
      
      await expect(storageService.setItem('test', testData))
        .rejects.toThrow(StorageErrorClass);
    });
  });

  describe('removeItem', () => {
    it('should remove item from localStorage', async () => {
      await storageService.removeItem('test');
      
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('test');
    });

    it('should handle removal errors', async () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('Removal failed');
      });
      
      await expect(storageService.removeItem('test'))
        .rejects.toThrow(StorageErrorClass);
    });
  });

  describe('clear', () => {
    it('should clear all localStorage data', async () => {
      await storageService.clear();
      
      expect(mockLocalStorage.clear).toHaveBeenCalled();
    });

    it('should handle clear errors', async () => {
      mockLocalStorage.clear.mockImplementation(() => {
        throw new Error('Clear failed');
      });
      
      await expect(storageService.clear())
        .rejects.toThrow(StorageErrorClass);
    });
  });

  describe('typed storage operations', () => {
    describe('getTimeEntries', () => {
      it('should return time entries with converted dates', async () => {
        const storedEntries = [
          {
            id: '1',
            taskId: 'task1',
            startTime: '2024-01-01T10:00:00.000Z',
            endTime: '2024-01-01T11:00:00.000Z',
            duration: 3600000,
          }
        ];
        
        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedEntries));
        validateWithSchema.mockReturnValue({ success: true, data: storedEntries });
        
        const result = await storageService.getTimeEntries();
        
        expect(result[0].startTime).toBeInstanceOf(Date);
        expect(result[0].endTime).toBeInstanceOf(Date);
        expect(result[0].startTime.toISOString()).toBe('2024-01-01T10:00:00.000Z');
      });

      it('should handle entries without endTime', async () => {
        const storedEntries = [
          {
            id: '1',
            taskId: 'task1',
            startTime: '2024-01-01T10:00:00.000Z',
            endTime: null,
            duration: 0,
          }
        ];
        
        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedEntries));
        validateWithSchema.mockReturnValue({ success: true, data: storedEntries });
        
        const result = await storageService.getTimeEntries();
        
        expect(result[0].startTime).toBeInstanceOf(Date);
        expect(result[0].endTime).toBeUndefined();
      });
    });

    describe('setTimeEntries', () => {
      it('should store time entries with validation', async () => {
        const entries = [
          {
            id: '1',
            taskId: 'task1',
            startTime: new Date('2024-01-01T10:00:00.000Z'),
            endTime: new Date('2024-01-01T11:00:00.000Z'),
            duration: 3600000,
          }
        ];
        
        validateWithSchema.mockReturnValue({ success: true, data: entries });
        
        await storageService.setTimeEntries(entries);
        
        expect(validateWithSchema).toHaveBeenCalledWith(
          expect.any(Object), // z.array(TimeEntrySchema)
          entries
        );
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'timeEntries',
          JSON.stringify(entries)
        );
      });
    });

    describe('getTasks', () => {
      it('should return tasks from storage', async () => {
        const tasks = [{ id: '1', name: 'Test Task' }];
        
        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(tasks));
        validateWithSchema.mockReturnValue({ success: true, data: tasks });
        
        const result = await storageService.getTasks();
        
        expect(result).toEqual(tasks);
        expect(mockLocalStorage.getItem).toHaveBeenCalledWith('predefinedTasks');
      });
    });

    describe('getDailyGoal', () => {
      it('should return daily goal with nullable schema', async () => {
        const goal = { targetAmount: 100, currency: 'USD' };
        
        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(goal));
        validateWithSchema.mockReturnValue({ success: true, data: goal });
        
        const result = await storageService.getDailyGoal();
        
        expect(result).toEqual(goal);
      });

      it('should return null when no goal exists', async () => {
        mockLocalStorage.getItem.mockReturnValue(null);
        
        const result = await storageService.getDailyGoal();
        
        expect(result).toBe(null);
      });
    });
  });

  describe('backup and migration', () => {
    describe('createBackup', () => {
      it('should create backup for existing data', async () => {
        const testData = { test: 'value' };
        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(testData));
        
        await storageService.createBackup('test');
        
        expect(mockLocalStorage.getItem).toHaveBeenCalledWith('test');
        expect(createBackup).toHaveBeenCalledWith('test', testData);
      });

      it('should handle missing data gracefully', async () => {
        mockLocalStorage.getItem.mockReturnValue(null);
        
        await storageService.createBackup('test');
        
        expect(createBackup).not.toHaveBeenCalled();
      });

      it('should handle backup errors', async () => {
        mockLocalStorage.getItem.mockReturnValue('{"test": "value"}');
        createBackup.mockImplementation(() => {
          throw new Error('Backup failed');
        });
        
        await expect(storageService.createBackup('test'))
          .rejects.toThrow(StorageErrorClass);
      });
    });

    describe('needsMigration', () => {
      it('should check if data needs migration', async () => {
        const testData = { version: 1 };
        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(testData));
        needsMigration.mockReturnValue(true);
        
        const result = await storageService.needsMigration('test');
        
        expect(result).toBe(true);
        expect(needsMigration).toHaveBeenCalledWith(testData);
      });

      it('should return false for missing data', async () => {
        mockLocalStorage.getItem.mockReturnValue(null);
        
        const result = await storageService.needsMigration('test');
        
        expect(result).toBe(false);
      });

      it('should handle errors gracefully', async () => {
        mockLocalStorage.getItem.mockImplementation(() => {
          throw new Error('Access denied');
        });
        
        const result = await storageService.needsMigration('test');
        
        expect(result).toBe(false);
      });
    });
  });
});
