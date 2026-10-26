import { describe, it, expect } from 'vitest';
import { REVEAL_LABEL, revealAction } from '../reveal';
import { fakeBackend, installFakeBackendForTest } from '../../testing';

describe('revealAction', () => {
  it('is a button that shows the file in the file manager', async () => {
    const [action] = revealAction('/Users/me/export.json');

    expect(action.label).toBe(REVEAL_LABEL);
    if (!('onClick' in action)) throw new Error('expected a button');
    await action.onClick();
    expect(fakeBackend().platform.reveal).toHaveBeenCalledWith('/Users/me/export.json');
  });

  it('is nothing without a path', () => {
    expect(revealAction(undefined)).toEqual([]);
    expect(revealAction(null)).toEqual([]);
    expect(revealAction('')).toEqual([]);
  });

  it('is nothing where the platform cannot reveal files', () => {
    installFakeBackendForTest({ without: ['reveal'] });
    expect(revealAction('/Users/me/export.json')).toEqual([]);
  });
});
