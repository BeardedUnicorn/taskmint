/**
 * Runs an operation and warns in the console when it is slow. (The metric
 * store and reports this module used to keep were never read.)
 */

const SLOW_OPERATION_MS = 1000;

export async function measurePerformance<T>(
  operation: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    if (duration > SLOW_OPERATION_MS) {
      console.warn(`Slow operation: ${operation} took ${Math.round(duration)}ms`);
    }
  }
}
