import { describe, expect, it, vi } from 'vitest';
import { readLocal, subscribeLocal, writeLocal } from '../localStore';

describe('localStore', () => {
  it('reads a stored null as null, and wraps a value saved before versioning', () => {
    localStorage.setItem('goal', 'null');
    expect(readLocal('goal', 5)).toBeNull();

    localStorage.setItem('filters', JSON.stringify({ show: 'all' }));
    expect(readLocal('filters', {})).toEqual({ show: 'all' });
    expect(JSON.parse(localStorage.getItem('filters')!)).toMatchObject({ version: 1, data: { show: 'all' } });
    expect(readLocal('filters', {})).toEqual({ show: 'all' });
  });

  it("tells a key's listeners about other windows' writes, and everyone about a clear", () => {
    const tasks = vi.fn();
    const goal = vi.fn();
    const stopTasks = subscribeLocal('tasks', tasks);
    subscribeLocal('goal', goal);

    window.dispatchEvent(new StorageEvent('storage', { key: 'tasks' }));
    expect([tasks.mock.calls.length, goal.mock.calls.length]).toEqual([1, 0]);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect([tasks.mock.calls.length, goal.mock.calls.length]).toEqual([2, 1]);

    stopTasks();
    writeLocal('tasks', ['a'], []);
    expect(tasks).toHaveBeenCalledTimes(2);
  });
});
