/**
 * Test Setup Configuration
 * 
 * This file is run before each test file and sets up the testing environment
 * with necessary polyfills, mocks, and global configurations.
 */

import '@testing-library/jest-dom';

// Setup DOM container for React testing
beforeEach(() => {
  // Create a div element to serve as the container for React components
  const div = document.createElement('div');
  div.setAttribute('id', 'root');
  document.body.appendChild(div);
});

afterEach(() => {
  // Clean up the DOM after each test
  const root = document.getElementById('root');
  if (root) {
    document.body.removeChild(root);
  }
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock URL.createObjectURL
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: jest.fn(() => 'mocked-url'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: jest.fn(),
});

// Mock navigator.clipboard - make it configurable for userEvent
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn(() => Promise.resolve()),
    readText: jest.fn(() => Promise.resolve('')),
  },
  writable: true,
  configurable: true,
});

// Mock document.createElement and related DOM APIs for file downloads
const mockLink = {
  href: '',
  download: '',
  style: { display: '' },
  click: jest.fn(),
};

// Store original DOM methods for testing
const originalCreateElement = document.createElement;
const originalAppendChild = document.body.appendChild;
const originalRemoveChild = document.body.removeChild;

// Mock DOM methods for file download tests
const mockAppendChild = jest.fn();
const mockRemoveChild = jest.fn();

// Create a proper DOM container for React Testing Library
beforeEach(() => {
  // Restore original DOM methods for React Testing Library
  document.createElement = originalCreateElement;
  document.body.appendChild = originalAppendChild;
  document.body.removeChild = originalRemoveChild;

  // Create a div element to serve as the container for React components
  const div = document.createElement('div');
  div.setAttribute('id', 'root');
  document.body.appendChild(div);
});

afterEach(() => {
  // Clean up the container after each test
  const root = document.getElementById('root');
  if (root) {
    document.body.removeChild(root);
  }

  // Set up mocks for file download tests
  document.createElement = jest.fn((tagName) => {
    if (tagName === 'a') {
      return mockLink;
    }
    return originalCreateElement.call(document, tagName);
  }) as any;
  document.body.appendChild = mockAppendChild;
  document.body.removeChild = mockRemoveChild;
});

// Mock console methods to reduce noise in tests
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('componentWillReceiveProps') ||
        args[0].includes('componentWillUpdate'))
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.clear();
  sessionStorageMock.clear();
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveClass(className: string): R;
      toHaveStyle(style: Record<string, any>): R;
    }
  }
}

// Export test utilities for use in test files
export const testUtils = {
  // Mock timer functions
  mockTimer: () => {
    jest.useFakeTimers();
    return {
      advanceTimersByTime: (ms: number) => jest.advanceTimersByTime(ms),
      runAllTimers: () => jest.runAllTimers(),
      restore: () => jest.useRealTimers(),
    };
  },

  // Mock date functions
  mockDate: (date: string | Date) => {
    const mockDate = new Date(date);
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
    return {
      restore: () => jest.restoreAllMocks(),
    };
  },

  // Create mock time entry
  createMockTimeEntry: (overrides = {}) => ({
    id: 'test-entry-1',
    taskName: 'Test Task',
    startTime: new Date('2023-01-01T10:00:00Z'),
    endTime: new Date('2023-01-01T11:00:00Z'),
    duration: 3600000, // 1 hour in milliseconds
    isRunning: false,
    date: '2023-01-01',
    ...overrides,
  }),

  // Create mock task
  createMockTask: (overrides = {}) => ({
    id: 'test-task-1',
    name: 'Test Task',
    hourlyRate: 50,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
    ...overrides,
  }),



  // Wait for async operations
  waitFor: async (callback: () => void | Promise<void>, timeout = 1000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        await callback();
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    throw new Error(`waitFor timeout after ${timeout}ms`);
  },
};
