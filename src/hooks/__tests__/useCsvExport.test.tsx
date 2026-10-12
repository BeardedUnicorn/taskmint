import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useCsvExport, EXPORT_CANCELLED } from '../useCsvExport';
import { isTauriEnvironment } from '../../utils/tauri';

const showSuccess = vi.fn();
const showError = vi.fn();
const notifications = { showSuccess, showError };
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => notifications,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../utils/tauri', () => ({ isTauriEnvironment: vi.fn() }));

describe('useCsvExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves through the Save dialog in the app and says where', async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue('/Users/me/Downloads/entries.csv');
    const { result } = renderHook(() => useCsvExport());

    await act(() => result.current.exportCsv('a,b\r\n', 'entries.csv'));

    expect(invoke).toHaveBeenCalledWith('export_csv_file', {
      csv: 'a,b\r\n',
      suggestedFilename: 'entries.csv',
    });
    expect(showSuccess).toHaveBeenCalledWith('Saved to /Users/me/Downloads/entries.csv');
  });

  it('stays quiet when the Save dialog is cancelled', async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
    vi.mocked(invoke).mockRejectedValue(EXPORT_CANCELLED);
    const { result } = renderHook(() => useCsvExport());

    await act(() => result.current.exportCsv('a', 'entries.csv'));

    expect(showError).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it('reports a failed save', async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(true);
    vi.mocked(invoke).mockRejectedValue('Failed to write export file: disk full');
    const { result } = renderHook(() => useCsvExport());

    await act(() => result.current.exportCsv('a', 'entries.csv'));

    expect(showError).toHaveBeenCalledWith(
      "Couldn't export the CSV: Failed to write export file: disk full"
    );
  });

  it('downloads the file in a browser', async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(false);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result } = renderHook(() => useCsvExport());

    await act(() => result.current.exportCsv('a', 'entries.csv'));

    expect(invoke).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith('Downloaded entries.csv');
    click.mockRestore();
  });
});
