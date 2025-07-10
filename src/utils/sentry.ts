import * as Sentry from '@sentry/react';

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

  // Set user context if available
  Sentry.setUser({
    id: 'user-' + Date.now(), // You can replace this with actual user ID
  });

  // Set additional context
  Sentry.setTag('component', 'react-app');
  Sentry.setContext('app', {
    name: 'TaskMint',
    version: '0.1.0',
  });

  console.log('Sentry initialized successfully');
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
