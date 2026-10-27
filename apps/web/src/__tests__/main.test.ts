import { describe, expect, it, vi } from 'vitest';
import { start } from '../start';

vi.mock('../start', () => ({ start: vi.fn(async () => undefined) }));

describe('the web entry', () => {
  it('starts in #root', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    await import('../main');

    expect(start).toHaveBeenCalledWith(root);
  });
});
