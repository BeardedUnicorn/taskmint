/**
 * Sentry Test Utilities
 * 
 * Use these functions to test if Sentry is properly configured and working.
 * These should only be used in development for testing purposes.
 */

import { captureException, captureMessage, addBreadcrumb, setContext, setTag } from './sentry';

/**
 * Test basic error capture
 */
export function testSentryErrorCapture() {
  if (import.meta.env.MODE !== 'development') {
    console.warn('Sentry tests should only be run in development mode');
    return;
  }

  console.log('🧪 Testing Sentry error capture...');
  
  try {
    // Create a test error
    const testError = new Error('Test error from Sentry test utility');
    testError.stack = `Error: Test error from Sentry test utility
    at testSentryErrorCapture (sentryTest.ts:20:25)
    at Object.<anonymous> (console)`;
    
    // Add context for the test
    setContext('sentryTest', {
      testType: 'error_capture',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
    
    setTag('test', 'sentry-error-capture');
    
    addBreadcrumb(
      'Testing Sentry error capture',
      'test',
      'info',
      { testFunction: 'testSentryErrorCapture' }
    );
    
    // Capture the test error
    captureException(testError, {
      testType: 'manual_test',
      component: 'sentryTest',
    });
    
    console.log('✅ Test error sent to Sentry. Check your Sentry dashboard.');
  } catch (error) {
    console.error('❌ Failed to test Sentry error capture:', error);
  }
}

/**
 * Test message capture
 */
export function testSentryMessageCapture() {
  if (import.meta.env.MODE !== 'development') {
    console.warn('Sentry tests should only be run in development mode');
    return;
  }

  console.log('🧪 Testing Sentry message capture...');
  
  try {
    setContext('sentryMessageTest', {
      testType: 'message_capture',
      timestamp: new Date().toISOString(),
    });
    
    setTag('test', 'sentry-message-capture');
    
    addBreadcrumb(
      'Testing Sentry message capture',
      'test',
      'info',
      { testFunction: 'testSentryMessageCapture' }
    );
    
    captureMessage('Test message from Sentry test utility', 'info', {
      testType: 'manual_test',
      component: 'sentryTest',
    });
    
    console.log('✅ Test message sent to Sentry. Check your Sentry dashboard.');
  } catch (error) {
    console.error('❌ Failed to test Sentry message capture:', error);
  }
}

/**
 * Test unhandled promise rejection
 */
export function testUnhandledPromiseRejection() {
  if (import.meta.env.MODE !== 'development') {
    console.warn('Sentry tests should only be run in development mode');
    return;
  }

  console.log('🧪 Testing unhandled promise rejection...');
  
  // Create an unhandled promise rejection
  Promise.reject(new Error('Test unhandled promise rejection from Sentry test utility'));
  
  console.log('✅ Unhandled promise rejection triggered. Check your Sentry dashboard.');
}

/**
 * Test uncaught error
 */
export function testUncaughtError() {
  if (import.meta.env.MODE !== 'development') {
    console.warn('Sentry tests should only be run in development mode');
    return;
  }

  console.log('🧪 Testing uncaught error...');
  
  // Use setTimeout to create an uncaught error
  setTimeout(() => {
    throw new Error('Test uncaught error from Sentry test utility');
  }, 100);
  
  console.log('✅ Uncaught error will be triggered in 100ms. Check your Sentry dashboard.');
}

/**
 * Run all Sentry tests
 */
export function runAllSentryTests() {
  if (import.meta.env.MODE !== 'development') {
    console.warn('Sentry tests should only be run in development mode');
    return;
  }

  console.log('🧪 Running all Sentry tests...');
  
  testSentryErrorCapture();
  
  setTimeout(() => {
    testSentryMessageCapture();
  }, 1000);
  
  setTimeout(() => {
    testUnhandledPromiseRejection();
  }, 2000);
  
  setTimeout(() => {
    testUncaughtError();
  }, 3000);
  
  console.log('✅ All Sentry tests scheduled. Check your Sentry dashboard in a few moments.');
}

// Make functions available globally in development
if (import.meta.env.MODE === 'development') {
  (window as any).sentryTest = {
    testSentryErrorCapture,
    testSentryMessageCapture,
    testUnhandledPromiseRejection,
    testUncaughtError,
    runAllSentryTests,
  };
  
  console.log('🔧 Sentry test functions available globally as window.sentryTest');
  console.log('Available functions:');
  console.log('  - window.sentryTest.testSentryErrorCapture()');
  console.log('  - window.sentryTest.testSentryMessageCapture()');
  console.log('  - window.sentryTest.testUnhandledPromiseRejection()');
  console.log('  - window.sentryTest.testUncaughtError()');
  console.log('  - window.sentryTest.runAllSentryTests()');
}
