import * as Sentry from '@sentry/react';
import type { Breadcrumb, ErrorEvent } from '@sentry/react';

// Import package.json to get version dynamically
import packageJson from '../../package.json';
import { STORAGE_KEYS } from '../constants';

// Error reports only: no session replay, no performance tracing. Events are
// scrubbed down to diagnostic fields so task names, notes, earnings and
// captured work-log data never leave the machine.

// Context/extra/breadcrumb keys that describe *where* an error happened, not
// the user's data. Anything else (taskName, payloads, field values) is dropped.
const ALLOWED_DETAIL_KEYS = new Set([
  'service',
  'method',
  'severity',
  'timestamp',
  'type',
  'code',
  'filename',
  'lineno',
  'colno',
  'componentStack',
  'recoveryAttempts',
  'maxRecoveryAttempts',
  'errorMessage',
  'originalError',
  'originalStack',
]);

// Contexts Sentry fills in itself (runtime, OS, browser, our 'app' block).
const SDK_CONTEXTS = new Set(['app', 'browser', 'device', 'os', 'runtime', 'culture', 'trace']);

// Breadcrumb categories that can carry user content (console arguments,
// IPC/fetch bodies, typed input).
const DROPPED_BREADCRUMB_CATEGORIES = new Set(['console', 'fetch', 'xhr', 'ui.input']);

function pickAllowed(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (ALLOWED_DETAIL_KEYS.has(key)) kept[key] = value;
  }
  return kept;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category && DROPPED_BREADCRUMB_CATEGORIES.has(breadcrumb.category)) {
    return null;
  }
  return { ...breadcrumb, data: pickAllowed(breadcrumb.data) };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event };
  delete scrubbed.request;
  delete scrubbed.server_name;
  scrubbed.user = event.user?.id ? { id: event.user.id } : undefined;
  scrubbed.extra = pickAllowed(event.extra);
  if (event.contexts) {
    const contexts: NonNullable<ErrorEvent['contexts']> = {};
    for (const [name, context] of Object.entries(event.contexts)) {
      contexts[name] = SDK_CONTEXTS.has(name)
        ? context
        : pickAllowed(context as Record<string, unknown> | undefined);
    }
    scrubbed.contexts = contexts;
  }
  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }
  return scrubbed;
}

/** Whether the user allows error reports (Settings → Privacy). Default on. */
export function isErrorReportingEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.ERROR_REPORTING_ENABLED) !== 'false';
  } catch {
    return true;
  }
}

/** Persist the preference and start or stop reporting immediately. */
export async function setErrorReportingEnabled(enabled: boolean): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEYS.ERROR_REPORTING_ENABLED, String(enabled));
  } catch {
    // Preference just won't persist; still apply it for this run.
  }
  if (enabled) {
    initSentry();
  } else {
    await Sentry.close();
  }
}

/** Stable anonymous id so repeat errors group by install, not by launch. */
function getInstallId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEYS.INSTALL_ID);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.INSTALL_ID, id);
    return id;
  } catch {
    return 'unknown';
  }
}

let globalHandlersInstalled = false;

/**
 * Initialize Sentry for error tracking
 */
export function initSentry() {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

  // Only initialize Sentry if DSN is provided
  if (!sentryDsn || sentryDsn === 'your_sentry_dsn_here') {
    console.warn('Sentry DSN not configured. Error tracking will be disabled.');
    return;
  }

  if (!isErrorReportingEnabled()) {
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE || 'development',
    release: `${packageJson.name}@${packageJson.version}`,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
  });

  // Window listeners outlive Sentry.close(); install them once.
  if (!globalHandlersInstalled) {
    setupGlobalErrorHandlers();
    globalHandlersInstalled = true;
  }

  Sentry.setUser({ id: getInstallId() });

  // Set additional context
  Sentry.setTag('component', 'react-app');
  Sentry.setContext('app', {
    name: packageJson.name,
    version: packageJson.version,
  });
}

/**
 * Set up global error handlers to catch unhandled errors and promise rejections
 */
function setupGlobalErrorHandlers() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Properly serialize the error reason
    let error: Error;
    let reasonString: string;
    
    if (event.reason instanceof Error) {
      error = event.reason;
      reasonString = event.reason.message;
    } else if (typeof event.reason === 'object' && event.reason !== null) {
      const reasonAsAny = event.reason as any;
      reasonString = reasonAsAny.message || reasonAsAny.toString() || JSON.stringify(event.reason);
      error = new Error(reasonString);
    } else {
      reasonString = String(event.reason);
      error = new Error(reasonString);
    }
    
    addBreadcrumb(
      'Unhandled promise rejection',
      'error',
      'error',
      {
        reason: reasonString,
        promise: event.promise?.toString(),
      }
    );

    captureException(error, {
      type: 'unhandledrejection',
      reason: reasonString,
    });
  });

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    
    const error = event.error instanceof Error ? event.error : new Error(event.message);
    
    addBreadcrumb(
      'Uncaught error',
      'error',
      'error',
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        message: event.message,
      }
    );

    captureException(error, {
      type: 'uncaught',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });
}

/**
 * Capture an exception with additional context
 */
export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message with additional context
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>) {
  Sentry.captureMessage(message, level);
  if (context) {
    Sentry.setContext('message_context', context);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(message: string, category: string, level: Sentry.SeverityLevel = 'info', data?: Record<string, any>) {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
  });
}

/**
 * Set user context
 */
export function setUser(user: { id?: string; email?: string; username?: string }) {
  Sentry.setUser(user);
}

/**
 * Set additional context
 */
export function setContext(key: string, context: Record<string, any>) {
  Sentry.setContext(key, context);
}

/**
 * Set tags for filtering
 */
export function setTag(key: string, value: string) {
  Sentry.setTag(key, value);
}

export { Sentry };
