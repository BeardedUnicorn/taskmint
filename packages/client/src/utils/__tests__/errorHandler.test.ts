import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, createServiceErrorHandler } from '../errorHandler';
import { addBreadcrumb, captureException, setContext } from '../sentry';

vi.mock('../sentry', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn(), setContext: vi.fn() }));

const handler = createServiceErrorHandler('TaskService');

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('ServiceErrorHandler', () => {
  it("keeps the failure's own message, whatever was thrown", () => {
    expect(handler.handleError(new Error('disk full'), 'getAll').message).toBe('disk full');
    expect(handler.handleError('Session not found', 'getAll').message).toBe('Session not found');
    expect(handler.handleError({ message: 'quota exceeded' }, 'getAll').message).toBe('quota exceeded');
    expect(handler.handleError(42, 'getAll').message).toBe('42');
  });

  it('reports to Sentry with the service and method', () => {
    const error = handler.handleError(new Error('boom'), 'getAll', { taskId: 't1' });
    expect(error).toBeInstanceOf(AppError);
    expect(error.context).toEqual({ service: 'TaskService', method: 'getAll', taskId: 't1' });
    expect(addBreadcrumb).toHaveBeenCalledWith(
      'Service error in TaskService.getAll',
      'error',
      'error',
      expect.objectContaining({ originalError: 'boom', taskId: 't1' })
    );
    expect(setContext).toHaveBeenCalledWith(
      'serviceError',
      expect.objectContaining({ service: 'TaskService', severity: 'medium' })
    );
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ method: 'getAll', originalError: 'boom' })
    );
  });

  it('rates changes high, storage and network trouble medium, and bad input low', () => {
    const severity = (message: string, method = 'getAll') => handler.handleError(new Error(message), method).severity;
    expect(severity('boom', 'updateTask')).toBe('high');
    expect(severity('storage is full')).toBe('medium');
    expect(severity('invalid hourly rate')).toBe('low');
    expect(severity('something else')).toBe('medium');
  });

  it('logs to the console in development', () => {
    vi.stubEnv('MODE', 'development');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    handler.handleError(new Error('boom'), 'getAll');
    expect(log).toHaveBeenCalledWith('[TaskService] Error in getAll:', expect.any(Error));
  });

  it('passes results through, and turns failures into AppErrors', async () => {
    await expect(handler.handleAsync(async () => 'ok', 'getAll')).resolves.toBe('ok');
    await expect(handler.handleAsync(async () => Promise.reject('nope'), 'getAll')).rejects.toMatchObject({
      message: 'nope',
      name: 'AppError',
    });
  });

  it('leaves info breadcrumbs', () => {
    handler.logInfo('Loaded 3 tasks', 'getAll', { count: 3 });
    expect(addBreadcrumb).toHaveBeenCalledWith('TaskService.getAll: Loaded 3 tasks', 'info', 'info', {
      service: 'TaskService',
      method: 'getAll',
      count: 3,
    });
  });
});

it('an AppError defaults to no context and medium severity', () => {
  const error = new AppError('x');
  expect([error.context, error.severity, error.name]).toEqual([{}, 'medium', 'AppError']);
});
