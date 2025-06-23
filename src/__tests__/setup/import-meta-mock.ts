// Mock import.meta for Jest tests
// This is needed because Jest doesn't understand Vite's import.meta.env syntax

// Define the mock object
const importMetaMock = {
  env: {
    VITE_GOOGLE_CLIENT_ID: 'test_client_id',
    VITE_GOOGLE_CLIENT_SECRET: 'test_client_secret',
  },
};

// Mock import.meta globally
Object.defineProperty(globalThis, 'import', {
  value: {
    meta: importMetaMock,
  },
  writable: true,
});

// Also define it on global for older Node versions
if (typeof global !== 'undefined') {
  Object.defineProperty(global, 'import', {
    value: {
      meta: importMetaMock,
    },
    writable: true,
  });
}

// Ensure process is properly defined for Jest
if (typeof process === 'undefined') {
  (global as any).process = {
    env: {
      NODE_ENV: 'test'
    },
    stdout: {
      isTTY: false
    },
    stderr: {
      isTTY: false
    }
  };
}
