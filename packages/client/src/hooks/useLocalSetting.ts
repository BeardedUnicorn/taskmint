/**
 * A device setting in localStorage, checked against a schema: every component
 * reading the key sees the same value, a stored value the schema refuses
 * reads as the default, and a value it refuses is never saved.
 */

import { useCallback } from 'react';
import { z } from 'zod';
import { createStorageError } from '../types/errors';
import { useLocalStorage } from './useLocalStorage';

export function useLocalSetting<T>(
  key: string,
  defaultValue: T,
  schema: z.ZodType<T>
): readonly [T, (value: T) => Promise<void>] {
  const [stored, setStored] = useLocalStorage<unknown>(key, defaultValue);
  const parsed = schema.safeParse(stored);
  const value = parsed.success ? parsed.data : defaultValue;

  const update = useCallback(
    async (next: T) => {
      const checked = schema.safeParse(next);
      if (!checked.success) {
        throw createStorageError('STORAGE_VALIDATION_FAILED', `Data validation failed for key "${key}"`, {
          key,
          validationError: checked.error.message,
        });
      }
      setStored(checked.data);
    },
    [key, schema, setStored]
  );

  return [value, update] as const;
}
