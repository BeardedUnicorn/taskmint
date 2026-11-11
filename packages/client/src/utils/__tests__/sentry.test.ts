import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { scrubEvent, scrubBreadcrumb, isErrorReportingEnabled, setErrorReportingEnabled } from '../sentry';

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

describe('initSentry', () => {
  const DSN = 'https://key@o1.ingest.sentry.io/1';
  /** A fresh copy of the module (it installs its window handlers once). */
  const load = async () => {
    vi.resetModules();
    return import('../sentry');
  };

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('stays off without a DSN, or when the user turned reports off', async () => {
    for (const dsn of ['', 'your_sentry_dsn_here']) {
      vi.stubEnv('VITE_SENTRY_DSN', dsn);
      (await load()).initSentry();
    }
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    localStorage.setItem('errorReportingEnabled', 'false');
    (await load()).initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('starts scrubbed, as this install, and reports what the page lets slip, once', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const sentry = await load();
    sentry.initSentry();
    // Again, as turning reports back on does
    sentry.initSentry();

    const options = vi.mocked(Sentry.init).mock.calls[0][0]!;
    expect(options).toMatchObject({ dsn: DSN, sendDefaultPii: false, environment: 'test' });
    const event = { type: undefined, extra: { taskName: 'secret', service: 'TaskService' } } as ErrorEvent;
    expect(options.beforeSend!(event, {})).toMatchObject({ extra: { service: 'TaskService' } });
    expect(options.beforeBreadcrumb!({ category: 'console' }, {})).toBeNull();
    const [[first], [second]] = vi.mocked(Sentry.setUser).mock.calls;
    expect(first).toEqual({ id: expect.any(String) });
    expect(second).toEqual(first);

    const rejected = (reason: unknown, promise?: Promise<unknown>) =>
      window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason, promise }));
    const pending = new Promise(() => {});
    rejected(new Error('disk full'), pending);
    rejected('Session not found');
    rejected({ message: 'quota exceeded' });
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new TypeError('x is undefined'),
        message: 'x is undefined',
        filename: 'a.js',
        lineno: 1,
        colno: 2,
      })
    );
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

    const reported = vi
      .mocked(Sentry.captureException)
      .mock.calls.map(([error, hint]) => [(error as Error).message, (hint as { extra: { type: string } }).extra.type]);
    expect(reported).toEqual([
      ['disk full', 'unhandledrejection'],
      ['Session not found', 'unhandledrejection'],
      ['quota exceeded', 'unhandledrejection'],
      ['x is undefined', 'uncaught'],
      ['Script error.', 'uncaught'],
    ]);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Unhandled promise rejection',
        data: { reason: 'disk full', promise: '[object Promise]' },
      })
    );
  });

  it('keeps going when storage is unavailable', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const sentry = await load();
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.mocked(localStorage.setItem).mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    expect(sentry.isErrorReportingEnabled()).toBe(true);
    await sentry.setErrorReportingEnabled(true);
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'unknown' });
  });
});

it('passes context on to Sentry', async () => {
  const { setContext } = await import('../sentry');
  setContext('serviceError', { service: 'TaskService' });
  expect(Sentry.setContext).toHaveBeenCalledWith('serviceError', { service: 'TaskService' });
});
