export const performanceMonitor = {
  recordMetric: vi.fn(),
  setEnabled: vi.fn(),
  isEnabled: vi.fn(() => true),
  clearMetrics: vi.fn(),
  getReport: vi.fn(() => ({
    totalOperations: 0,
    averageDuration: 0,
    slowOperations: [],
    criticalOperations: [],
    memoryUsage: [],
    recommendations: [],
  })),
  getMetricsByCategory: vi.fn(() => []),
  getMetricsByOperation: vi.fn(() => []),
};

export const withPerformanceMonitoring = vi.fn((fn) => fn);
export const measurePerformance = vi.fn((_, fn) => fn());
export const usePerformanceMonitoring = vi.fn();
export const usePerformanceReport = vi.fn(() => ({ report: null, refreshReport: vi.fn() }));
export const startMemoryMonitoring = vi.fn(() => vi.fn());
