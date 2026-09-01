/**
 * Mock for @tauri-apps/api/event
 */

// Track active listeners for cleanup
const activeListeners = new Map<string, Function[]>();

export const listen = vi.fn().mockImplementation((event: string, handler: Function) => {
  // Store the handler for potential triggering in tests
  if (!activeListeners.has(event)) {
    activeListeners.set(event, []);
  }
  activeListeners.get(event)!.push(handler);

  // Return unsubscribe function that removes the handler
  const unsubscribe = () => {
    const handlers = activeListeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  };

  // Return promise that resolves immediately with unsubscribe function
  return Promise.resolve(unsubscribe);
});

export const emit = vi.fn().mockImplementation((event: string, payload?: any) => {
  // Trigger any registered listeners for this event
  const handlers = activeListeners.get(event);
  if (handlers) {
    handlers.forEach(handler => {
      try {
        handler({ payload });
      } catch (error) {
        console.error('Error in mocked event handler:', error);
      }
    });
  }
  return Promise.resolve();
});

export const once = vi.fn().mockImplementation((event: string, handler: Function) => {
  // Create a one-time handler that unsubscribes itself after first call
  const onceHandler = (eventData: any) => {
    handler(eventData);
    unsubscribe();
  };

  if (!activeListeners.has(event)) {
    activeListeners.set(event, []);
  }
  activeListeners.get(event)!.push(onceHandler);

  const unsubscribe = () => {
    const handlers = activeListeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(onceHandler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  };

  return Promise.resolve(unsubscribe);
});

// Helper function for tests to trigger events
export const __triggerEvent = vi.fn((event: string, payload?: any) => {
  const handlers = activeListeners.get(event);
  if (handlers) {
    handlers.forEach(handler => {
      try {
        handler({ payload });
      } catch (error) {
        console.error('Error in triggered event handler:', error);
      }
    });
  }
});

// Helper function for tests to clear all listeners
export const __clearAllListeners = () => {
  activeListeners.clear();
};
