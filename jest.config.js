/** @type {import('jest').Config} */
export default {
  // Test environment
  testEnvironment: 'jsdom',

  // Setup files
  setupFiles: [
    '<rootDir>/src/__tests__/setup/import-meta-mock.ts'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/setupTests.ts',
    '<rootDir>/src/__tests__/integration/test-setup.ts'
  ],

  // Module name mapping for CSS and asset files
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub',
    '^@tauri-apps/api/core$': '<rootDir>/src/__mocks__/@tauri-apps/api/core.ts',
    '^@tauri-apps/api/event$': '<rootDir>/src/__mocks__/@tauri-apps/api/event.ts',
    '^@tauri-apps/api/webviewWindow$': '<rootDir>/src/__mocks__/@tauri-apps/api/webviewWindow.ts',
    '^@tauri-apps/api/fs$': '<rootDir>/src/__mocks__/@tauri-apps/api/fs.ts',
    '^@tauri-apps/api/path$': '<rootDir>/src/__mocks__/@tauri-apps/api/path.ts',
    '^dayjs$': '<rootDir>/src/__mocks__/dayjs.ts',
    '^dayjs/plugin/(.*)$': '<rootDir>/src/__mocks__/dayjs.ts',
  },

  // Transform files
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
      },
    }],
  },

  // File extensions to consider
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(test|spec).(ts|tsx|js)',
    '<rootDir>/src/**/*.(test|spec).(ts|tsx|js)',
  ],

  // Exclude setup files from test discovery
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/src/__tests__/integration/test-setup.ts',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.*',
    '!src/**/*.spec.*',
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>/src'],

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Verbose output
  verbose: true,

  // Test timeout
  testTimeout: 10000,

  // Global setup/teardown
  globalSetup: undefined,
  globalTeardown: undefined,
};
