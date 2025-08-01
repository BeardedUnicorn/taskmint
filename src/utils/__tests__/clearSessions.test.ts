import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllSessions } from '../clearSessions';
import { invoke } from '@tauri-apps/api/core';

// The invoke function is globally mocked in setup files, but we customise per test

describe('clearAllSessions', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it('invokes the Tauri command to clear sessions', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await clearAllSessions();

    expect(invoke).toHaveBeenCalledWith('clear_all_sessions');
  });

  it('throws when Tauri command fails', async () => {
    const error = new Error('failed');
    vi.mocked(invoke).mockRejectedValue(error);

    await expect(clearAllSessions()).rejects.toThrow(error);
  });
});
