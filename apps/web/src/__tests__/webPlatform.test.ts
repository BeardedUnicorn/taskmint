import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CORE_ERRORS, LINKS } from '@taskmint/contracts';
import { createWebPlatform, downloadName } from '../webPlatform';

const platform = createWebPlatform();

describe('the web platform', () => {
  it('has no desktop-only features, and counts usage with Firebase Analytics', () => {
    expect(Object.keys(platform)).toEqual(['files', 'notifications', 'analytics', 'openLink']);
  });

  it("opens TaskMint's pages in a new tab", async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await platform.openLink!('issues');
    expect(open).toHaveBeenCalledWith(LINKS.ISSUES, '_blank', 'noopener');
    open.mockRestore();
  });

  describe('exports', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      URL.createObjectURL = vi.fn(() => 'blob:export');
      URL.revokeObjectURL = vi.fn();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('are downloads with a safe name', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      const saved = await platform.files.save({ contents: 'a,b', suggestedName: 'reports/may', format: 'csv' });

      expect(saved).toEqual({ kind: 'download', name: 'may.csv' });
      const link = click.mock.contexts[0] as HTMLAnchorElement;
      expect(link.download).toBe('may.csv');
      expect(link.href).toBe('blob:export');
      const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
      expect(blob.type).toBe('text/csv');
      vi.runAllTimers();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
      click.mockRestore();
    });

    it('end in their format', () => {
      expect(downloadName('backup.JSON', 'json')).toBe('backup.JSON');
      expect(downloadName('backup', 'json')).toBe('backup.json');
      expect(downloadName('C:\\Users\\me\\  ', 'json')).toBe('taskmint-export.json');
    });
  });

  describe('imports', () => {
    /** Answers the file dialog the platform opens. */
    function pick(answer: (input: HTMLInputElement) => void) {
      return vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
        answer(this);
      });
    }

    function choose(input: HTMLInputElement, file: File | null) {
      Object.defineProperty(input, 'files', { value: file ? [file] : [] });
      input.dispatchEvent(new Event('change'));
    }

    it('read the JSON file picked', async () => {
      const click = pick(input => {
        expect(input.accept).toBe('.json,application/json');
        choose(input, new File(['{"version":"2"}'], 'backup.json'));
      });
      await expect(platform.files.openJson()).resolves.toBe('{"version":"2"}');
      click.mockRestore();
    });

    it('are nothing when the dialog is dismissed', async () => {
      let click = pick(input => input.dispatchEvent(new Event('cancel')));
      await expect(platform.files.openJson()).resolves.toBeNull();
      click.mockRestore();
      click = pick(input => choose(input, null));
      await expect(platform.files.openJson()).resolves.toBeNull();
      click.mockRestore();
    });

    it("fail as the desktop's do for a file that isn't JSON, or can't be read", async () => {
      let click = pick(input => choose(input, new File(['not json'], 'notes.txt')));
      await expect(platform.files.openJson()).rejects.toMatch(new RegExp(`^${CORE_ERRORS.INVALID_JSON_FILE}: `));
      click.mockRestore();

      const unreadable = new File([''], 'gone.json');
      unreadable.text = () => Promise.reject(new Error('gone'));
      click = pick(input => choose(input, unreadable));
      await expect(platform.files.openJson()).rejects.toBe('Failed to read import file: gone');
      click.mockRestore();
    });
  });

  describe('notifications', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function browserNotifications(permission: NotificationPermission, asked: NotificationPermission = permission) {
      const shown: unknown[] = [];
      const Notification = Object.assign(
        vi.fn(function (title: string, options: NotificationOptions) {
          shown.push({ title, ...options });
        }),
        { permission, requestPermission: vi.fn(async () => asked) }
      );
      vi.stubGlobal('Notification', Notification);
      return { Notification, shown };
    }

    it('show when the browser allows them', async () => {
      const { shown } = browserNotifications('granted');
      await expect(platform.notifications.show('longRun', 'Still going', '3 hours')).resolves.toBe(true);
      expect(shown).toEqual([{ title: 'Still going', body: '3 hours' }]);
    });

    it('ask first, and stay quiet when refused', async () => {
      let browser = browserNotifications('default', 'granted');
      await expect(platform.notifications.show('idlePause', 'Paused', 'Away')).resolves.toBe(true);
      expect(browser.Notification.requestPermission).toHaveBeenCalled();

      browser = browserNotifications('default', 'denied');
      await expect(platform.notifications.show('idlePause', 'Paused', 'Away')).resolves.toBe(false);
      expect(browser.shown).toEqual([]);
    });

    it("don't exist in every browser", async () => {
      vi.stubGlobal('Notification', undefined);
      await expect(platform.notifications.show('idlePause', 'Paused', 'Away')).resolves.toBe(false);
    });
  });
});
