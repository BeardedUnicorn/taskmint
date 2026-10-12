import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ErrorEvent } from '@sentry/react';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  close: vi.fn().mockResolvedValue(true),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/react';
import {
  scrubEvent,
  scrubBreadcrumb,
  isErrorReportingEnabled,
  setErrorReportingEnabled,
} from '../sentry';

describe('scrubEvent', () => {
  it('keeps diagnostic fields and drops user data from extra and custom contexts', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'boom',
      request: { url: 'tauri://localhost/' },
      user: { id: 'install-1', email: 'someone@example.com' },
      extra: { service: 'TaskService', method: 'addTask', taskName: 'Client X', payload: '{...}' },
      contexts: {
        os: { name: 'macOS' },
        serviceError: { service: 'TaskService', taskName: 'Client X', notes: 'secret' },
        errorBoundary: { componentStack: '\n at Foo', recoveryAttempts: 1 },
      },
      breadcrumbs: [
        { category: 'console', message: 'Client X earned $500' },
        { category: 'fetch', data: { url: 'ipc://localhost/get_sessions' } },
        { category: 'error', message: 'Service error', data: { method: 'addTask', taskName: 'Client X' } },
      ],
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.user).toEqual({ id: 'install-1' });
    expect(scrubbed.extra).toEqual({ service: 'TaskService', method: 'addTask' });
    expect(scrubbed.contexts?.os).toEqual({ name: 'macOS' });
    expect(scrubbed.contexts?.serviceError).toEqual({ service: 'TaskService' });
    expect(scrubbed.contexts?.errorBoundary).toEqual({ componentStack: '\n at Foo', recoveryAttempts: 1 });
    expect(scrubbed.breadcrumbs).toEqual([
      { category: 'error', message: 'Service error', data: { method: 'addTask' } },
    ]);
    expect(JSON.stringify(scrubbed)).not.toContain('Client X');
  });
});

describe('scrubBreadcrumb', () => {
  it('drops categories that carry user content', () => {
    for (const category of ['console', 'fetch', 'xhr', 'ui.input']) {
      expect(scrubBreadcrumb({ category, message: 'x' })).toBeNull();
    }
  });

  it('keeps navigation-style breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'button.MuiButton' })).toEqual({
      category: 'ui.click',
      message: 'button.MuiButton',
      data: undefined,
    });
  });
});

describe('error reporting preference', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('defaults to enabled', () => {
    expect(isErrorReportingEnabled()).toBe(true);
  });

  it('turning it off persists and closes the client', async () => {
    await setErrorReportingEnabled(false);
    expect(isErrorReportingEnabled()).toBe(false);
    expect(Sentry.close).toHaveBeenCalled();
  });

  it('turning it back on persists the preference', async () => {
    await setErrorReportingEnabled(false);
    await setErrorReportingEnabled(true);
    expect(isErrorReportingEnabled()).toBe(true);
  });
});
