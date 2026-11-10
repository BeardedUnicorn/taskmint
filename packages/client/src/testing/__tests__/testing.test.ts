import { describe, it, expect, vi } from 'vitest';
import { getBackend } from '../../backend';
import { readAppRecord } from '../../services/appRecords';
import { createFakeBackend, fakeBackend, installFakeBackendForTest, seedAppRecords } from '..';

describe('createFakeBackend', () => {
  it('behaves like an empty desktop by default', async () => {
    const backend = createFakeBackend();

    expect(backend.capabilities).toEqual({ runtime: 'desktop', dataLocation: 'local' });
    await expect(backend.call('get_sessions')).resolves.toBeUndefined();
    await expect(
      backend.platform.files.save({ contents: '', suggestedName: 'a.csv', format: 'csv' })
    ).resolves.toBeNull();
    await expect(backend.platform.files.openJson()).resolves.toBeNull();
    await expect(backend.platform.notifications.show('test', 't', 'b')).resolves.toBe(false);
    await expect(backend.platform.notifications.setPreferences!({} as never)).resolves.toBeUndefined();
    await expect(backend.platform.idle.isSupported()).resolves.toBe(true);
    await expect(
      backend.platform.idle.setSettings({ enabled: false, thresholdMinutes: 15, longRunHours: 4 })
    ).resolves.toBeUndefined();
    await expect(backend.platform.idle.getPending()).resolves.toBeNull();
    await expect(backend.platform.idle.resolve('stayPaused')).resolves.toBeUndefined();
    await expect(backend.platform.folderBackups.defaultFolder()).resolves.toBeNull();
    await expect(backend.platform.folderBackups.pickFolder()).resolves.toBeNull();
    await expect(backend.platform.folderBackups.validateFolder('/b')).resolves.toEqual({ isValid: true });
    await expect(
      backend.platform.folderBackups.write({ folder: '/b', contents: '{}', maxBackups: 3 })
    ).resolves.toMatchObject({ success: true });
    await expect(backend.platform.folderBackups.list('/b')).resolves.toEqual([]);
    await expect(backend.platform.folderBackups.read('/b', 'backup.json')).resolves.toBe('{}');
    await expect(backend.platform.tray.setWithdrawalLabel('Withdrawal open')).resolves.toBeUndefined();
    expect(backend.platform.systemBars.setTheme('dark')).toBeUndefined();
    await expect(backend.platform.reveal('/b/file')).resolves.toBeUndefined();
    await expect(backend.platform.captureStatus()).resolves.toEqual({ running: true, port: 43117, warning: null });
  });

  it('takes other capabilities and leaves out platform features', () => {
    const backend = createFakeBackend({
      capabilities: { runtime: 'web', dataLocation: 'server' },
      without: ['idle', 'folderBackups', 'tray', 'systemBars', 'reveal', 'captureStatus', 'googleSignIn'],
    });

    expect(backend.capabilities).toEqual({ runtime: 'web', dataLocation: 'server' });
    expect(Object.keys(backend.platform).sort()).toEqual(['files', 'notifications']);
  });

  it('emits to subscribers until they unsubscribe', () => {
    const backend = createFakeBackend();
    const handler = vi.fn();
    const unsubscribe = backend.subscribe('tick', handler);

    backend.emit('tick', 1);
    unsubscribe();
    backend.emit('tick', 2);
    backend.emit('nobody-listens');

    expect(handler.mock.calls).toEqual([[1]]);
    expect(backend.listenerCount('tick')).toBe(0);
    expect(backend.listenerCount('nobody-listens')).toBe(0);
  });
});

describe('installFakeBackendForTest', () => {
  const fileFake = fakeBackend();

  it('swaps the backend for one test', () => {
    const web = installFakeBackendForTest({ without: ['idle'] });
    expect(getBackend()).toBe(web);
    expect(fakeBackend()).toBe(web);
  });

  it('puts the earlier one back afterwards', () => {
    expect(getBackend()).toBe(fileFake);
    expect(fakeBackend()).toBe(fileFake);
  });
});

describe('fakeBackend', () => {
  it('needs one installed first', async () => {
    vi.resetModules();
    const fresh = await import('..');
    expect(() => fresh.fakeBackend()).toThrow('No fake backend: call installFakeBackend first');
  });
});

describe('seedAppRecords', () => {
  it('loads the records as given, copied', () => {
    const tasks = [{ id: 't1' }];
    seedAppRecords({ predefinedTasks: tasks });
    tasks.push({ id: 't2' });

    expect(readAppRecord('predefinedTasks')).toEqual([{ id: 't1' }]);
  });
});
