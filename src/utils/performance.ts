/**
 * Performance Monitoring Utilities
 *
 * Provides comprehensive performance monitoring, profiling, and optimization
 * tools for identifying bottlenecks and tracking application performance.
 */

import React from 'react';

// Performance thresholds (in milliseconds)
export const PERFORMANCE_THRESHOLDS = {
  SLOW_OPERATION: 100,
  VERY_SLOW_OPERATION: 500,
  CRITICAL_OPERATION: 1000,
  MEMORY_WARNING: 50 * 1024 * 1024, // 50MB
  MEMORY_CRITICAL: 100 * 1024 * 1024, // 100MB
} as const;

// Performance metric types
export interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  category: 'timer' | 'storage' | 'ui' | 'network' | 'computation';
  severity: 'normal' | 'slow' | 'very_slow' | 'critical';
  metadata?: Record<string, any>;
}

export interface MemoryMetric {
  timestamp: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  percentage: number;
}

export interface PerformanceReport {
  totalOperations: number;
  averageDuration: number;
  slowOperations: PerformanceMetric[];
  criticalOperations: PerformanceMetric[];
  memoryUsage: MemoryMetric[];
  recommendations: string[];
}

// Performance monitoring class
class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private memoryMetrics: MemoryMetric[] = [];
  private maxMetrics = 1000; // Keep last 1000 metrics
  private maxMemoryMetrics = 100; // Keep last 100 memory snapshots
  private isEnabled = true;

  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`Performance monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  

  /**
   * Record a performance metric
   */
  recordMetric(metric: Omit<PerformanceMetric, 'timestamp' | 'severity'>): void {
    if (!this.isEnabled) return;

    const severity = this.calculateSeverity(metric.duration);
    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: Date.now(),
      severity,
    };

    this.metrics.push(fullMetric);

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow operations
    if (severity !== 'normal') {
      console.warn(
        `🐌 Slow operation detected: ${metric.operation} took ${metric.duration}ms (${severity})`,
        fullMetric
      );
    }
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(): void {
    if (!this.isEnabled || !('memory' in performance)) return;

    const memory = (performance as any).memory;
    const memoryMetric: MemoryMetric = {
      timestamp: Date.now(),
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      percentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
    };

    this.memoryMetrics.push(memoryMetric);

    // Keep only the most recent memory metrics
    if (this.memoryMetrics.length > this.maxMemoryMetrics) {
      this.memoryMetrics = this.memoryMetrics.slice(-this.maxMemoryMetrics);
    }

    // Warn about high memory usage
    if (memoryMetric.usedJSHeapSize > PERFORMANCE_THRESHOLDS.MEMORY_WARNING) {
      const severity = memoryMetric.usedJSHeapSize > PERFORMANCE_THRESHOLDS.MEMORY_CRITICAL 
        ? 'CRITICAL' : 'WARNING';
      
      console.warn(
        `🧠 ${severity}: High memory usage detected: ${(memoryMetric.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB (${memoryMetric.percentage.toFixed(1)}%)`,
        memoryMetric
      );
    }
  }

  /**
   * Get performance report
   */
  getReport(): PerformanceReport {
    const totalOperations = this.metrics.length;
    const averageDuration = totalOperations > 0 
      ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / totalOperations 
      : 0;

    const slowOperations = this.metrics.filter(m => 
      m.severity === 'slow' || m.severity === 'very_slow'
    );

    const criticalOperations = this.metrics.filter(m => 
      m.severity === 'critical'
    );

    const recommendations = this.generateRecommendations();

    return {
      totalOperations,
      averageDuration,
      slowOperations,
      criticalOperations,
      memoryUsage: this.memoryMetrics.slice(-10), // Last 10 memory snapshots
      recommendations,
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.memoryMetrics = [];
    console.log('Performance metrics cleared');
  }

  /**
   * Get metrics by category
   */
  getMetricsByCategory(category: PerformanceMetric['category']): PerformanceMetric[] {
    return this.metrics.filter(m => m.category === category);
  }

  /**
   * Get metrics by operation name
   */
  getMetricsByOperation(operation: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.operation === operation);
  }

  private calculateSeverity(duration: number): PerformanceMetric['severity'] {
    if (duration >= PERFORMANCE_THRESHOLDS.CRITICAL_OPERATION) return 'critical';
    if (duration >= PERFORMANCE_THRESHOLDS.VERY_SLOW_OPERATION) return 'very_slow';
    if (duration >= PERFORMANCE_THRESHOLDS.SLOW_OPERATION) return 'slow';
    return 'normal';
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const report = {
      totalOperations: this.metrics.length,
      slowOperations: this.metrics.filter(m => m.severity !== 'normal'),
      memoryUsage: this.memoryMetrics.slice(-1)[0],
    };

    // Performance recommendations
    if (report.slowOperations.length > report.totalOperations * 0.1) {
      recommendations.push('Consider optimizing frequently slow operations');
    }

    const timerOperations = this.getMetricsByCategory('timer');
    if (timerOperations.some(m => m.severity !== 'normal')) {
      recommendations.push('Timer operations are slow - check system tray updates');
    }

    const storageOperations = this.getMetricsByCategory('storage');
    if (storageOperations.some(m => m.severity !== 'normal')) {
      recommendations.push('Storage operations are slow - consider data optimization');
    }

    // Memory recommendations
    if (report.memoryUsage && report.memoryUsage.percentage > 80) {
      recommendations.push('High memory usage detected - consider implementing data cleanup');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance looks good! No issues detected.');
    }

    return recommendations;
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Higher-order function to wrap operations with performance monitoring
 */
export function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  fn: T,
  operation: string,
  category: PerformanceMetric['category'] = 'computation',
  metadata?: Record<string, any>
): T {
  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    if (!performanceMonitor.isEnabled()) {
      return fn.apply(this, args);
    }

    const start = performance.now();

    try {
      const result = fn.apply(this, args);

      if (result instanceof Promise) {
        return result.then(res => {
          const end = performance.now();
          performanceMonitor.recordMetric({
            operation,
            duration: end - start,
            category,
            metadata: { ...metadata, args: args.length },
          });
          return res;
        }).catch(error => {
          const end = performance.now();
          performanceMonitor.recordMetric({
            operation: `${operation}_error`,
            duration: end - start,
            category,
            metadata: { ...metadata, args: args.length, error: error?.message || 'Unknown error' },
          });
          throw error;
        }) as ReturnType<T>;
      }

      const end = performance.now();
      performanceMonitor.recordMetric({
        operation,
        duration: end - start,
        category,
        metadata: { ...metadata, args: args.length },
      });

      return result;
    } catch (error: any) {
      const end = performance.now();
      performanceMonitor.recordMetric({
        operation: `${operation}_error`,
        duration: end - start,
        category,
        metadata: { ...metadata, args: args.length, error: error?.message || 'Unknown error' },
      });
      throw error;
    }
  } as T;
}

/**
 * Decorator for class methods
 */
export function performanceMonitored(
  operation: string,
  category: PerformanceMetric['category'] = 'computation'
) {
  return function (target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = withPerformanceMonitoring(
      originalMethod,
      `${target.constructor.name}.${operation}`,
      category
    );
    
    return descriptor;
  };
}

/**
 * Hook for React components to monitor render performance
 */
export function usePerformanceMonitoring(componentName: string) {
  const renderStart = performance.now();
  
  React.useEffect(() => {
    const renderDuration = performance.now() - renderStart;
    performanceMonitor.recordMetric({
      operation: `${componentName}_render`,
      duration: renderDuration,
      category: 'ui',
    });
  });
}

/**
 * Utility to measure and log operation performance
 */
export async function measurePerformance<T>(
  operation: string,
  fn: () => T | Promise<T>,
  category: PerformanceMetric['category'] = 'computation',
  metadata?: Record<string, any>
): Promise<T> {
  if (!performanceMonitor.isEnabled()) {
    return await Promise.resolve(fn());
  }

  const start = performance.now();

  try {
    const result = await fn();
    const duration = performance.now() - start;

    performanceMonitor.recordMetric({
      operation,
      duration,
      category,
      metadata,
    });

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    performanceMonitor.recordMetric({
      operation: `${operation}_error`,
      duration,
      category,
      metadata: { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' },
    });

    throw error;
  }
}

/**
 * Start periodic memory monitoring
 */
export function startMemoryMonitoring(intervalMs: number = 30000): () => void {
  const intervalId = setInterval(() => {
    performanceMonitor.recordMemoryUsage();
  }, intervalMs);
  
  console.log(`Memory monitoring started (interval: ${intervalMs}ms)`);
  
  return () => {
    clearInterval(intervalId);
    console.log('Memory monitoring stopped');
  };
}

/**
 * Performance monitoring React hook
 */
export function usePerformanceReport() {
  const [report, setReport] = React.useState<PerformanceReport | null>(null);
  
  const refreshReport = React.useCallback(() => {
    setReport(performanceMonitor.getReport());
  }, []);
  
  React.useEffect(() => {
    refreshReport();
    const interval = setInterval(refreshReport, 10000); // Update every 10 seconds
    
    return () => clearInterval(interval);
  }, [refreshReport]);
  
  return { report, refreshReport };
}

// Auto-start memory monitoring in development
if (process.env.NODE_ENV === 'development') {
  startMemoryMonitoring(30000); // Every 30 seconds
}
