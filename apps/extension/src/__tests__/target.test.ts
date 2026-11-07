import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeFake, type ChromeFake } from './chromeFake';
import { DESKTOP, loadTarget, originPattern, saveTarget, sendsInTheClear, serverUrl } from '../target';

let chrome: ChromeFake;

beforeEach(() => {
  chrome = installChromeFake();
});

describe('where captures go', () => {
  it('is the desktop app until a server is saved', async () => {
    expect(await loadTarget()).toEqual(DESKTOP);
    const server = { kind: 'server', url: 'https://t.example.com', token: 'tmk_1' } as const;
    await saveTarget(server);
    expect(chrome.storage.local.data.target).toEqual(server);
    expect(await loadTarget()).toEqual(server);
  });

  it("falls back to the desktop app when what's saved isn't a target", async () => {
    for (const saved of [
      null,
      'server',
      { kind: 'server', url: 'https://t.example.com' },
      { kind: 'server', url: 1, token: 'x' },
      { kind: 'cloud' },
    ]) {
      chrome.storage.local.data.target = saved;
      expect(await loadTarget()).toEqual(DESKTOP);
    }
  });

  it('takes http and https server addresses, without the trailing slash', () => {
    expect(serverUrl('  https://time.example.com/  ')).toBe('https://time.example.com');
    expect(serverUrl('http://localhost:8080/taskmint/?tab=1#x')).toBe('http://localhost:8080/taskmint');
    expect(serverUrl('ftp://files.example.com')).toBeNull();
    expect(serverUrl('localhost:8080')).toBeNull();
    expect(serverUrl('not an address')).toBeNull();
  });

  it('allows plain http only to this computer', () => {
    for (const local of [
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://127.1',
      'http://[::1]:8080',
      'https://time.example.com',
    ]) {
      expect(sendsInTheClear(local)).toBe(false);
    }
    for (const remote of [
      'http://time.example.com',
      'http://192.168.1.5:8080',
      'http://127.0.0.1.example.com',
      'http://[2001:db8::1]',
    ]) {
      expect(sendsInTheClear(remote)).toBe(true);
    }
  });

  it("asks for the server's origin only", () => {
    expect(originPattern('http://localhost:8080/taskmint')).toBe('http://localhost:8080/*');
  });
});
