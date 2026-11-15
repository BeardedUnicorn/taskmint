import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  LAST_SEEN_VERSION_KEY,
  releasesSinceUpdate,
  UPDATED_FROM_VERSION_KEY,
  useUpdatedNotice,
} from '../useUpdatedNotice';
import { RELEASES } from '../../utils/changelog';
import { readLocal, writeLocal } from '../../utils/localStore';
import { APP_VERSION } from '../../utils/appVersion';

const mockNotify = vi.hoisted(() => vi.fn());
vi.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: mockNotify }),
}));

const seen = () => readLocal<unknown>(LAST_SEEN_VERSION_KEY, null);
const updatedFrom = () => readLocal<unknown>(UPDATED_FROM_VERSION_KEY, null);
/** The release before this one (the changelog has the app's own version first). */
const previous = RELEASES[1].version;
const older = '0.0.1';
const newer = `${Number(APP_VERSION.split('.')[0]) + 1}.0.0`;

describe('useUpdatedNotice', () => {
  beforeEach(() => {
    mockNotify.mockClear();
  });

  it('points to the release notes after an update, once', () => {
    writeLocal<unknown>(LAST_SEEN_VERSION_KEY, previous, null);
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
    expect(updatedFrom()).toBe(previous);

    rerender();
    renderHook(() => useUpdatedNotice());
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('points to everything since the version before, after an update that skipped releases', () => {
    writeLocal<unknown>(LAST_SEEN_VERSION_KEY, older, null);
    renderHook(() => useUpdatedNotice());

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: `Updated to TaskMint ${APP_VERSION}`,
        message: "See what's new since 0.0.1.",
        actions: [{ label: "What's new", view: 'settings', section: 'about' }],
      })
    );
    expect(updatedFrom()).toBe(older);
    expect(releasesSinceUpdate(older).length).toBeGreaterThan(1);
    expect(releasesSinceUpdate(older)[0].version).toBe(APP_VERSION);
  });

  it('names the version when none was seen before', () => {
    renderHook(() => useUpdatedNotice());
    expect(updatedFrom()).toBeNull();
    expect(releasesSinceUpdate(null)).toEqual([]);

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
    expect(updatedFrom()).toBeNull();
    expect(releasesSinceUpdate(newer)).toEqual([]);
  });

  it('says nothing for the version already seen', () => {
    writeLocal<unknown>(LAST_SEEN_VERSION_KEY, APP_VERSION, null);
    renderHook(() => useUpdatedNotice());

    expect(mockNotify).not.toHaveBeenCalled();
  });
});
