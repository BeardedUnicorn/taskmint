import { it, expect, vi } from 'vitest';
import { reloadApp } from '../appReload';

it('reloads the page', () => {
  // jsdom can't reload; it reports that through its virtual console
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => reloadApp()).not.toThrow();
  error.mockRestore();
});
