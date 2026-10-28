import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateTaskName, validateWithSchema } from '../validation';

describe('validateWithSchema', () => {
  it("reports what the schema couldn't do", () => {
    const throws = (thrown: unknown) =>
      z.string().transform(() => {
        throw thrown;
      });
    expect(validateWithSchema(throws(new Error('cannot transform')), 'x')).toEqual({
      success: false,
      error: 'cannot transform',
    });
    expect(validateWithSchema(throws('not an Error'), 'x')).toEqual({
      success: false,
      error: 'Unknown validation error',
    });
  });
});

describe('validateTaskName', () => {
  it('takes a trimmed name of up to 100 characters', () => {
    expect(validateTaskName('  Review  ')).toEqual({ success: true, data: 'Review' });
    expect(validateTaskName('x'.repeat(101))).toEqual({
      success: false,
      error: 'Task name cannot exceed 100 characters',
    });
    expect(validateTaskName('   ')).toEqual({ success: false, error: 'Task name cannot be empty' });
    expect(validateTaskName(7 as unknown as string)).toEqual({ success: false, error: 'Task name must be a string' });
  });
});
