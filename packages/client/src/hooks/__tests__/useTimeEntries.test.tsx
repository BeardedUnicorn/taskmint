import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimeEntries } from '../useTimeEntries';
import { createMockTaskSession, createMockTimerInstance } from '../../__tests__/setup/session-test-utils';

const sessions = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => ({ sessions: sessions.list }),
}));

describe('useTimeEntries', () => {
  it('lists each timer as an entry, keeping the list while the sessions are the same', () => {
    sessions.list = [
      createMockTaskSession({ id: 's1', timerInstances: [createMockTimerInstance({ id: 'i1', sessionId: 's1' })] }),
    ];
    const { result, rerender } = renderHook(() => useTimeEntries());
    expect(result.current.map(entry => entry.id)).toEqual(['i1']);
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
