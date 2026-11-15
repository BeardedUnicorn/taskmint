import { describe, expect, it, vi } from 'vitest';
import { type Device, type PublishedWidgets, type PushDeps, STALE_AFTER_MS, notifyDevices, plan } from '../push';

const NOW = Date.UTC(2026, 10, 14);
const widgets = (timer: unknown, deviceId = 'desk'): PublishedWidgets => ({
  deviceId,
  json: JSON.stringify({ version: 2, timer }),
});
const device = (id: string, changes: Partial<Device> = {}): Device => ({
  id,
  fid: `fid-${id}`,
  updatedAtMs: NOW - 1000,
  ...changes,
});
const RUNNING = { task: 'Writing', countingFromMs: 1 };

describe('plan', () => {
  it('tells every device but the one that wrote, urgently when the timer changed', () => {
    const devices = [device('phone'), device('desk'), device('tablet')];
    expect(plan(widgets(null), widgets(RUNNING), devices, NOW)).toEqual({
      pushes: [
        { id: 'phone', fid: 'fid-phone', priority: 'high' },
        { id: 'tablet', fid: 'fid-tablet', priority: 'high' },
      ],
      stale: [],
    });
    // The first ever, with a timer: urgent; without one: not
    expect(plan(null, widgets(RUNNING), [device('phone')], NOW).pushes[0].priority).toBe('high');
    expect(plan(null, widgets(null), [device('phone')], NOW).pushes[0].priority).toBe('normal');
  });

  it('isn’t urgent while only the figures change', () => {
    const before = { deviceId: 'desk', json: JSON.stringify({ timer: RUNNING, today: { money: '$1' } }) };
    const after = { deviceId: 'desk', json: JSON.stringify({ timer: RUNNING, today: { money: '$2' } }) };
    expect(plan(before, after, [device('phone')], NOW).pushes).toEqual([
      { id: 'phone', fid: 'fid-phone', priority: 'normal' },
    ]);
    // Figures that don't read count as no timer
    const broken = { deviceId: 'desk', json: '{' };
    expect(plan(broken, { deviceId: 'desk', json: '{}' }, [device('phone')], NOW).pushes[0].priority).toBe('normal');
  });

  it('tells nobody when the widgets were deleted, and forgets an address two months old', () => {
    const old = device('old', { updatedAtMs: NOW - STALE_AFTER_MS - 1 });
    const kept = device('phone', { updatedAtMs: NOW - STALE_AFTER_MS });
    expect(plan(widgets(RUNNING), null, [kept, old], NOW)).toEqual({ pushes: [], stale: ['old'] });
    expect(plan(widgets(null), widgets(RUNNING), [kept, old], NOW)).toEqual({
      pushes: [{ id: 'phone', fid: 'fid-phone', priority: 'high' }],
      stale: ['old'],
    });
  });
});

describe('notifyDevices', () => {
  const deps = (devices: Device[]): { [K in keyof PushDeps]: ReturnType<typeof vi.fn<PushDeps[K]>> } => ({
    devices: vi.fn(async () => devices),
    send: vi.fn(async () => undefined),
    forget: vi.fn(async () => undefined),
    now: vi.fn(() => NOW),
    isGone: vi.fn((error: unknown) => error === 'gone'),
    warn: vi.fn(),
  });

  it('sends each push and forgets the stale addresses', async () => {
    const firebase = deps([device('phone'), device('old', { updatedAtMs: 0 })]);
    expect(await notifyDevices('bea', widgets(null), widgets(RUNNING), firebase)).toEqual({ sent: 1, forgotten: 1 });
    expect(firebase.devices).toHaveBeenCalledWith('bea');
    expect(firebase.send.mock.calls).toEqual([[{ fid: 'fid-phone', priority: 'high' }]]);
    expect(firebase.forget.mock.calls).toEqual([['bea', 'old']]);
  });

  it('forgets an address the push service no longer knows, and carries on past other failures', async () => {
    const firebase = deps([device('gone'), device('flaky'), device('phone')]);
    firebase.send.mockRejectedValueOnce('gone').mockRejectedValueOnce(new Error('unavailable'));
    expect(await notifyDevices('bea', widgets(null), widgets(RUNNING), firebase)).toEqual({ sent: 1, forgotten: 1 });
    expect(firebase.forget.mock.calls).toEqual([['bea', 'gone']]);
    expect(firebase.warn).toHaveBeenCalledWith('Couldn’t tell device flaky'.replace('’', "'"), expect.any(Error));
  });
});
