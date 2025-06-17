/**
 * Mock for dayjs library
 * 
 * This mock provides a simplified dayjs implementation for testing
 * that includes the necessary methods and plugin support.
 */

// Mock dayjs instance
const mockDayjs: any = jest.fn((date?: any): any => {
  const mockDate = date ? new Date(date) : new Date();

  return {
    format: jest.fn((format?: string) => {
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

    local: jest.fn(() => ({
      format: jest.fn((format?: string) => {
        if (format === 'HH:mm') {
          return mockDate.toTimeString().slice(0, 5);
        }
        return mockDate.toISOString();
      }),
    })),

    utc: jest.fn(() => ({
      format: jest.fn((format?: string) => {
        if (format === 'HH:mm') {
          return mockDate.toTimeString().slice(0, 5);
        }
        return mockDate.toISOString();
      }),
    })),

    tz: jest.fn((_timezone?: string) => ({
      format: jest.fn((format?: string) => {
        if (format === 'HH:mm') {
          return mockDate.toTimeString().slice(0, 5);
        }
        return mockDate.toISOString();
      }),
    })),

    fromNow: jest.fn(() => 'a few seconds ago'),

    toDate: jest.fn(() => mockDate),

    valueOf: jest.fn(() => mockDate.getTime()),

    isSame: jest.fn(() => true),
    isBefore: jest.fn(() => false),
    isAfter: jest.fn(() => false),

    add: jest.fn((): any => mockDayjs(new Date(mockDate.getTime() + 86400000))),
    subtract: jest.fn(() => mockDayjs(new Date(mockDate.getTime() - 86400000))),

    startOf: jest.fn(() => mockDayjs(mockDate)),
    endOf: jest.fn(() => mockDayjs(mockDate)),
  };
});

// Mock extend function for plugins
mockDayjs.extend = jest.fn();

// Mock static methods
mockDayjs.utc = jest.fn((date?: any) => mockDayjs(date));
mockDayjs.tz = jest.fn((date?: any, _timezone?: string) => mockDayjs(date));

// Export the mock
export default mockDayjs;

// Export plugin mocks
export const localizedFormat = jest.fn();
export const timezone = jest.fn();
export const utc = jest.fn();
export const relativeTime = jest.fn();
