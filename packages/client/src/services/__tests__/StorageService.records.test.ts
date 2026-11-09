/**
 * StorageService: the records (tasks, notes, templates, goal) go through
 * the app-records cache; other keys stay in localStorage.
 */

import { z } from 'zod';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '../StorageService';
import { loadAppRecords, readAppRecord, resetAppRecordsForTests } from '../appRecords';
import { fakeBackend } from '../../testing';

const mockInvoke = fakeBackend().call;
const task = {
  id: 't1',
  name: 'Annotation',
  hourlyRate: 40,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const note = {
  id: 'n1',
  taskId: 't1',
  templateId: 'free-form',
  templateName: 'Free-form Note',
  fieldValues: { content: 'hello' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('StorageService with app records', () => {
  const storage = StorageService.getInstance();

  beforeEach(async () => {
    vi.clearAllMocks();
    resetAppRecordsForTests();
    window.localStorage.clear();
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_app_records') {
        return { records: { predefinedTasks: [task], taskNotes: [note] }, revisions: {} };
      }
      return null;
    });
    await loadAppRecords({ importLegacy: false });
  });

  it('reads tasks and notes from the app records, with schema defaults applied', async () => {
    expect(await storage.getTasks()).toEqual([expect.objectContaining({ id: 't1' })]);
    const [loaded] = await storage.getTaskNotes();
    expect(loaded).toMatchObject({ id: 'n1', isArchived: false, noteLevel: 'task' });
    expect(window.localStorage.getItem('predefinedTasks')).toBeNull();
  });

  it('saves tasks to the app records', async () => {
    const renamed = { ...task, name: 'Annotation v2' };
    await storage.setTasks([renamed]);

    expect(mockInvoke).toHaveBeenCalledWith('set_app_record', {
      key: 'predefinedTasks',
      value: [renamed],
      baseRevision: 0,
    });
    expect(readAppRecord('predefinedTasks')).toEqual([renamed]);
    expect(window.localStorage.getItem('predefinedTasks')).toBeNull();
  });

  it('reads a record restored inside an old version wrapper, and nothing else as one', async () => {
    resetAppRecordsForTests();
    mockInvoke.mockImplementation(async (command: string) =>
      command === 'get_app_records'
        ? {
            records: { predefinedTasks: { version: 1, data: [task] }, taskNotes: { version: 1, notes: [] } },
            revisions: {},
          }
        : null
    );
    await loadAppRecords({ importLegacy: false });
    expect(await storage.getTasks()).toEqual([expect.objectContaining({ id: 't1' })]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(storage.getTaskNotes()).rejects.toMatchObject({ code: 'STORAGE_VALIDATION_FAILED' });
  });

  it('reads and saves the account settings, which are none until saved', async () => {
    expect(await storage.getAccountSettings()).toBeNull();
    await storage.setAccountSettings({ fundsReleaseDays: 4, withdrawalIntervalDays: 3 });
    expect(mockInvoke).toHaveBeenCalledWith('set_app_record', {
      key: 'accountSettings',
      value: { fundsReleaseDays: 4, withdrawalIntervalDays: 3 },
      baseRevision: 0,
    });
    expect(await storage.getAccountSettings()).toEqual({ fundsReleaseDays: 4, withdrawalIntervalDays: 3 });
  });

  it('rejects invalid data without saving it', async () => {
    await expect(storage.setTasks([{ id: '' } as never])).rejects.toMatchObject({
      code: 'STORAGE_VALIDATION_FAILED',
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('set_app_record', expect.anything());
  });

  it('reports a failed save', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('disk full'));
    await expect(storage.setTasks([task])).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' });
  });

  it('keeps other keys in localStorage', async () => {
    await storage.setItem('someSetting', { on: true }, z.object({ on: z.boolean() }));
    expect(JSON.parse(window.localStorage.getItem('someSetting')!)).toMatchObject({ version: 1, data: { on: true } });
    expect(mockInvoke).not.toHaveBeenCalledWith('set_app_record', expect.anything());
  });
});
