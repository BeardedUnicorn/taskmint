import { describe, it, expect } from 'vitest';
import { errorMessage } from '../errors';

describe('errorMessage', () => {
  it("is the failure's own message, whatever threw it", () => {
    expect(errorMessage(new Error(' disk full '), 'fallback')).toBe('disk full');
    expect(errorMessage(' Session not found ', 'fallback')).toBe('Session not found');
    expect(errorMessage({ message: 'quota exceeded' }, 'fallback')).toBe('quota exceeded');
  });

  it('falls back when there is no message to show', () => {
    for (const failure of [new Error('  '), '', { message: '  ' }, { message: 42 }, {}, null, undefined, 7]) {
      expect(errorMessage(failure, 'Something went wrong')).toBe('Something went wrong');
    }
  });
});
