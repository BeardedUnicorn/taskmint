import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCsvExport } from '../useCsvExport';
import { fakeBackend } from '../../testing';

const showSuccess = vi.fn();
const showError = vi.fn();
const notifications = { showSuccess, showError };
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => notifications,
}));

const save = () => fakeBackend().platform.files.save;

describe('useCsvExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves where the user picks and says where', async () => {
    save().mockResolvedValue({ kind: 'path', path: '/Users/me/Downloads/entries.csv' });
    const { result } = renderHook(() => useCsvExport());

    await act(() => result.current.exportCsv('a,b\r\n', 'entries.csv'));

    expect(save()).toHaveBeenCalledWith({ contents: 'a,b\r\n', suggestedName: 'entries.csv', format: 'csv' });
    expect(showSuccess).toHaveBeenCalledWith('Saved to /Users/me/Downloads/entries.csv', {
      category: 'export',
      actions: [expect.objectContaining({ label: expect.stringMatching(/^Show in (Finder|folder)$/) })],
    });
  });

  it('stays quiet when the Save dialog is cancelled', async () => {
    save().mockResolvedValue(null);
    const { result } = renderHook(() => useCsvExport());

    await act(() => result.current.exportCsv('a', 'entries.csv'));

    expect(showError).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it('reports a failed save', async () => {
    save().mockRejectedValue('Failed to write export file: disk full');
    const { result } = renderHook(() => useCsvExport());

    await act(() => result.current.exportCsv('a', 'entries.csv'));

    expect(showError).toHaveBeenCalledWith("Couldn't export the CSV: Failed to write export file: disk full");
  });

  it('says a browser download was downloaded', async () => {
    save().mockResolvedValue({ kind: 'download', name: 'entries.csv' });
    const { result } = renderHook(() => useCsvExport());

    await act(() => result.current.exportCsv('a', 'entries.csv'));

    expect(showSuccess).toHaveBeenCalledWith('Downloaded entries.csv', { category: 'export' });
  });
});
