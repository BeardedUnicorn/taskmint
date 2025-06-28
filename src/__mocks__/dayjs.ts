/**
 * Mock for dayjs library
 * 
 * This mock provides a simplified dayjs implementation for testing
 * that includes the necessary methods and plugin support.
 */

// Mock dayjs instance
const mockDayjs: any = vi.fn((date?: any): any => {
  const mockDate = date ? new Date(date) : new Date();

  return {
    format: vi.fn((format?: string) => {
      if (format === 'HH:mm') {
        return mockDate.toTimeString().slice(0, 5);
      }
      if (format === 'YYYY-MM-DD') {
        return mockDate.toISOString().split('T')[0];
      }
      if (format === 'MMM DD, YYYY') {
        return mockDate.toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric'
        });
      }
      return mockDate.toISOString();
    }),

    local: vi.fn(() => ({
      format: vi.fn((format?: string) => {
        if (format === 'HH:mm') {
          return mockDate.toTimeString().slice(0, 5);
        }
        return mockDate.toISOString();
      }),
    })),

    utc: vi.fn(() => ({
      format: vi.fn((format?: string) => {
        if (format === 'HH:mm') {
          return mockDate.toTimeString().slice(0, 5);
        }
        return mockDate.toISOString();
      }),
    })),

    tz: vi.fn((_timezone?: string) => ({
      format: vi.fn((format?: string) => {
        if (format === 'HH:mm') {
          return mockDate.toTimeString().slice(0, 5);
        }
        return mockDate.toISOString();
      }),
    })),

    fromNow: vi.fn(() => 'a few seconds ago'),

    toDate: vi.fn(() => mockDate),

    valueOf: vi.fn(() => mockDate.getTime()),

    isSame: vi.fn(() => true),
    isBefore: vi.fn(() => false),
    isAfter: vi.fn(() => false),

    add: vi.fn((): any => mockDayjs(new Date(mockDate.getTime() + 86400000))),
    subtract: vi.fn(() => mockDayjs(new Date(mockDate.getTime() - 86400000))),

    startOf: vi.fn(() => mockDayjs(mockDate)),
    endOf: vi.fn(() => mockDayjs(mockDate)),
  };
});

// Mock extend function for plugins
mockDayjs.extend = vi.fn();

// Mock static methods
mockDayjs.utc = vi.fn((date?: any) => mockDayjs(date));
mockDayjs.tz = vi.fn((date?: any, _timezone?: string) => mockDayjs(date));

// Export the mock
export default mockDayjs;

// Export plugin mocks
export const localizedFormat = vi.fn();
export const timezone = vi.fn();
export const utc = vi.fn();
export const relativeTime = vi.fn();
