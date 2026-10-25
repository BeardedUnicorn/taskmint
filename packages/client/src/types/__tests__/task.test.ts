/**
 * Task Type Schema Tests
 *
 * Covers TaskSchema validation, in particular the archiving fields:
 * legacy records without isArchived must parse with the zod default,
 * because StorageService fails the whole task-list load on any invalid
 * record and relies on the schema default as the backfill.
 */

import { describe, it, expect } from 'vitest';
import { TaskSchema } from '../task';

describe('TaskSchema', () => {
  const legacyTask = {
    id: 'task-1',
    name: 'Legacy Task',
    hourlyRate: 50,
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
  };

  it('parses a legacy record without archiving fields, defaulting isArchived to false', () => {
    const result = TaskSchema.safeParse(legacyTask);

    expect(result.success).toBe(true);
    expect(result.data?.isArchived).toBe(false);
    expect(result.data?.archivedAt).toBeUndefined();
  });

  it('accepts an archived task with an ISO archivedAt', () => {
    const result = TaskSchema.safeParse({
      ...legacyTask,
      isArchived: true,
      archivedAt: '2023-02-01T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(result.data?.isArchived).toBe(true);
    expect(result.data?.archivedAt).toBe('2023-02-01T00:00:00.000Z');
  });

  it('accepts a null archivedAt (unarchived state)', () => {
    const result = TaskSchema.safeParse({
      ...legacyTask,
      isArchived: false,
      archivedAt: null,
    });

    expect(result.success).toBe(true);
    expect(result.data?.archivedAt).toBeNull();
  });

  it('rejects a non-datetime archivedAt', () => {
    const result = TaskSchema.safeParse({
      ...legacyTask,
      isArchived: true,
      archivedAt: 'yesterday',
    });

    expect(result.success).toBe(false);
  });
});
