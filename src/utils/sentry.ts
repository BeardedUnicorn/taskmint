import * as Sentry from '@sentry/react';

// Import package.json to get version dynamically
import packageJson from '../../package.json';

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

  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE || 'development',
    release: `${packageJson.name}@${packageJson.version}`,
    // Enhanced error tracking
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Performance monitoring
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    // Session replay
    replaysSessionSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0,
    // Capture Console
    beforeSend(event) {
      // Filter out development errors in production
      if (import.meta.env.MODE === 'development') {
        console.log('Sentry Event:', event);
      }
      return event;
    },
    // Additional configuration
    beforeBreadcrumb(breadcrumb) {
      // Filter sensitive breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
        return null;
      }
      return breadcrumb;
    },
  });

  // Set up global error handlers
  setupGlobalErrorHandlers();

  // Set user context if available
  Sentry.setUser({
    id: 'user-' + Date.now(), // You can replace this with actual user ID
  });

  // Set additional context
  Sentry.setTag('component', 'react-app');
  Sentry.setContext('app', {
    name: packageJson.name,
    version: packageJson.version,
  });

  console.log('Sentry initialized successfully');
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
