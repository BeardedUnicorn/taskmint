import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { LAST_SEEN_VERSION_KEY, useUpdatedNotice } from '../useUpdatedNotice';
import { readLocal, writeLocal } from '../../utils/localStore';
import { APP_VERSION } from '../../utils/appVersion';

const mockNotify = vi.hoisted(() => vi.fn());
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify }),
}));

const seen = () => readLocal<unknown>(LAST_SEEN_VERSION_KEY, null);
const older = '0.0.1';
const newer = `${Number(APP_VERSION.split('.')[0]) + 1}.0.0`;

describe('useUpdatedNotice', () => {
  beforeEach(() => {
    mockNotify.mockClear();
  });

  it('points to the release notes after an update, once', () => {
    writeLocal<unknown>(LAST_SEEN_VERSION_KEY, older, null);
    const { rerender } = renderHook(() => useUpdatedNotice());

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith({
      title: `Updated to TaskMint ${APP_VERSION}`,
      message: "See what's new in this version.",
      severity: 'info',
      category: 'general',
      actions: [{ label: "What's new", view: 'settings', section: 'about' }],
      desktop: 'never',
    });
    expect(seen()).toBe(APP_VERSION);

    rerender();
    renderHook(() => useUpdatedNotice());
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('names the version when none was seen before', () => {
    renderHook(() => useUpdatedNotice());

    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: `TaskMint ${APP_VERSION}` }));
    expect(seen()).toBe(APP_VERSION);
  });

  it('treats an unreadable stored version as none', () => {
    writeLocal<unknown>(LAST_SEEN_VERSION_KEY, 'v-next', null);
    renderHook(() => useUpdatedNotice());

    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: `TaskMint ${APP_VERSION}` }));
  });

  it('notes an older version (a downgrade or a dev build) without a toast', () => {
    writeLocal<unknown>(LAST_SEEN_VERSION_KEY, newer, null);
    renderHook(() => useUpdatedNotice());

    expect(mockNotify).not.toHaveBeenCalled();
    expect(seen()).toBe(APP_VERSION);
  });

  it('says nothing for the version already seen', () => {
    writeLocal<unknown>(LAST_SEEN_VERSION_KEY, APP_VERSION, null);
    renderHook(() => useUpdatedNotice());

    expect(mockNotify).not.toHaveBeenCalled();
  });
});
