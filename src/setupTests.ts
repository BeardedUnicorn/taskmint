/**
 * Test Setup Configuration
 * 
 * This file is run before each test file and sets up the testing environment
 * with necessary polyfills, mocks, and global configurations.
 */

import '@testing-library/jest-dom/vitest';

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
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock window.matchMedia
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

// Mock ResizeObserver (vitest 4 requires constructible mocks: use `function`, not arrows)
global.ResizeObserver = vi.fn().mockImplementation(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});

// Mock URL.createObjectURL
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn(() => 'mocked-url'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn(),
});

// Mock navigator.clipboard - make it configurable for userEvent
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve('')),
  },
  writable: true,
  configurable: true,
});

// Mock document.createElement and related DOM APIs for file downloads
const mockLink = {
  href: '',
  download: '',
  style: { display: '' },
  click: vi.fn(),
};

// Store original DOM methods for testing
const originalCreateElement = document.createElement;
const originalAppendChild = document.body.appendChild;
const originalRemoveChild = document.body.removeChild;

// Mock DOM methods for file download tests
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();

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
  document.createElement = vi.fn((tagName) => {
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
  vi.clearAllMocks();
  localStorageMock.clear();
  sessionStorageMock.clear();
});


// Export test utilities for use in test files
export const testUtils = {
  // Mock timer functions
  mockTimer: () => {
    vi.useFakeTimers();
    return {
      advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
      runAllTimers: () => vi.runAllTimers(),
      restore: () => vi.useRealTimers(),
    };
  },

  // Mock date functions
  mockDate: (date: string | Date) => {
    const mockDate = new Date(date);
    vi.spyOn(global, 'Date').mockImplementation(() => mockDate);
    return {
      restore: () => vi.restoreAllMocks(),
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
    isArchived: false,
    archivedAt: null,
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
