// Manual mock for useSessionManagement for test runner edge cases
const mockSessionManagement = {
  sessions: [],
  activeSession: null,
  isLoading: false,
  error: null,
  createSession: jest.fn(),
  updateSession: jest.fn(),
  deleteSession: jest.fn(),
  createTimerInstance: jest.fn(),
  startTimerInstance: jest.fn(),
  stopTimerInstance: jest.fn(),
  pauseTimerInstance: jest.fn(),
  resumeTimerInstance: jest.fn(),
  setActiveSession: jest.fn(),
  refreshSessions: jest.fn(),
};

export const useSessionManagement = () => mockSessionManagement;
