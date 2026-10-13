/**
 * StorageService in the desktop app: the records (tasks, notes, templates,
 * goal) go through the appdata.json cache; other keys stay in localStorage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { StorageService } from '../StorageService';
import { loadAppRecords, readAppRecord, resetAppRecordsForTests } from '../appRecords';
import { isTauriEnvironment } from '../../utils/tauri';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../utils/tauri', () => ({ isTauriEnvironment: vi.fn(() => true) }));

const mockInvoke = vi.mocked(invoke);
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
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
    resetAppRecordsForTests();
    window.localStorage.clear();
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_app_records') {
        return { records: { predefinedTasks: [task], taskNotes: [note] } };
      }
      return null;
    });
    await loadAppRecords();
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

    expect(mockInvoke).toHaveBeenCalledWith('set_app_record', { key: 'predefinedTasks', value: [renamed] });
    expect(readAppRecord('predefinedTasks')).toEqual([renamed]);
    expect(window.localStorage.getItem('predefinedTasks')).toBeNull();
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
    await storage.setItem('someSetting', { on: true });
    expect(JSON.parse(window.localStorage.getItem('someSetting')!)).toEqual({ on: true });
    expect(mockInvoke).not.toHaveBeenCalledWith('set_app_record', expect.anything());
  });
});
