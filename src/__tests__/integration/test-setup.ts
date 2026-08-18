/**
 * Integration Test Setup
 * 
 * Common setup and utilities for integration tests
 */

import '@testing-library/jest-dom/vitest';

// Mock Tauri APIs globally
// Note: Tauri APIs are now mocked via Jest moduleNameMapper configuration
const mockTauriApis = () => {
  // Tauri APIs are automatically mocked via Jest configuration
  // This function is kept for backward compatibility but no longer needed
};

// Mock browser APIs
const mockBrowserApis = () => {
  // Performance API
  Object.defineProperty(window, 'performance', {
    value: {
      now: vi.fn(() => Date.now()),
      mark: vi.fn(),
      measure: vi.fn(),
      getEntriesByType: vi.fn(() => []),
      memory: {
        usedJSHeapSize: 1024 * 1024 * 10, // 10MB
        totalJSHeapSize: 1024 * 1024 * 50, // 50MB
        jsHeapSizeLimit: 1024 * 1024 * 100, // 100MB
      },
    },
    writable: true,
  });

  // ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // scrollTo
  Object.defineProperty(window, 'scrollTo', {
    value: vi.fn(),
    writable: true,
  });

  // getComputedStyle
  Object.defineProperty(window, 'getComputedStyle', {
    value: vi.fn().mockImplementation(() => ({
      getPropertyValue: vi.fn(),
    })),
    writable: true,
  });
};

// Mock localStorage with enhanced functionality
const createMockLocalStorage = () => {
  const store: Record<string, string> = {};
  
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    get length() {
      return Object.keys(store).length;
    },
    // Helper methods for testing
    _getStore: () => ({ ...store }),
    _setStore: (newStore: Record<string, string>) => {
      Object.keys(store).forEach(key => delete store[key]);
      Object.assign(store, newStore);
    },
  };
};

// Console methods for test output control
const mockConsole = () => {
  // Suppress console.log in tests unless explicitly needed
  const originalConsole = { ...console };

  const setupConsoleMocks = () => {
    if (process.env.JEST_VERBOSE !== 'true') {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'debug').mockImplementation(() => {});
    }

    // Always capture warnings and errors for test assertions
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  };

  const restoreConsoleMocks = () => {
    vi.restoreAllMocks();
  };

  return { originalConsole, setupConsoleMocks, restoreConsoleMocks };
};

// Date mocking utilities
const mockDate = () => {
  
  return {
    setSystemTime: (date: string | number | Date) => {
      vi.setSystemTime(new Date(date));
    },
    restoreSystemTime: () => {
      vi.useRealTimers();
    },
    advanceTime: (ms: number) => {
      vi.advanceTimersByTime(ms);
    },
  };
};

// Error boundary test utilities
const createErrorBoundaryUtils = () => {
  const originalError = console.error;
  
  return {
    suppressErrorBoundaryLogs: () => {
      // Suppress React error boundary logs in tests
      console.error = (...args: any[]) => {
        if (
          typeof args[0] === 'string' &&
          args[0].includes('Error boundaries should implement getDerivedStateFromError')
        ) {
          return;
        }
        originalError.call(console, ...args);
      };
    },
    restoreErrorLogs: () => {
      console.error = originalError;
    },
  };
};

// Test data factories
export const createTestTimeEntry = (overrides = {}) => ({
  id: `test-entry-${Date.now()}`,
  taskName: 'Test Task',
  startTime: new Date('2024-01-01T10:00:00.000Z'),
  endTime: new Date('2024-01-01T11:00:00.000Z'),
  duration: 3600000, // 1 hour
  isRunning: false,
  date: '2024-01-01',
  ...overrides,
});

export const createTestTask = (overrides = {}) => ({
  id: `test-task-${Date.now()}`,
  name: 'Test Task',
  hourlyRate: 50,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});



// Global test setup - only run if this is being imported, not executed as a test
const setupIntegrationTests = () => {
  mockTauriApis();
  mockBrowserApis();

  const { setupConsoleMocks, restoreConsoleMocks } = mockConsole();

  beforeEach(() => {
    // Reset all timers
    vi.useFakeTimers();

    // Setup console mocks
    setupConsoleMocks();

    // Reset localStorage
    const mockStorage = createMockLocalStorage();
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
    });

    // Reset system time to a known date
    vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    // Check if fake timers are active before running pending timers
    if (vi.isMockFunction(setTimeout)) {
      try {
        vi.runOnlyPendingTimers();
      } catch (error) {
        // Ignore errors if fake timers are not properly set up
      }
    }

    // Use real timers
    vi.useRealTimers();

    // Restore console mocks
    restoreConsoleMocks();

    // Clear all mocks
    vi.clearAllMocks();
  });
};

// Only setup if this file is being imported by a test file
if (typeof describe !== 'undefined') {
  setupIntegrationTests();
}

// Export utilities for use in tests
export {
  mockTauriApis,
  mockBrowserApis,
  createMockLocalStorage,
  mockConsole,
  mockDate,
  createErrorBoundaryUtils,
  setupIntegrationTests,
};

// Custom matchers for better test assertions
expect.extend({
  toBeValidTimeEntry(received) {
    const pass = (
      received &&
      typeof received.id === 'string' &&
      typeof received.taskName === 'string' &&
      received.startTime instanceof Date &&
      typeof received.isRunning === 'boolean' &&
      typeof received.date === 'string'
    );

    return {
      message: () => `expected ${received} to be a valid TimeEntry`,
      pass,
    };
  },
  
  toBeValidTask(received) {
    const pass = (
      received &&
      typeof received.id === 'string' &&
      typeof received.name === 'string' &&
      typeof received.createdAt === 'string' &&
      typeof received.updatedAt === 'string'
    );

    return {
      message: () => `expected ${received} to be a valid Task`,
      pass,
    };
  },
  

});

// Declare custom matchers for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidTimeEntry(): R;
      toBeValidTask(): R;
    }
  }
}
