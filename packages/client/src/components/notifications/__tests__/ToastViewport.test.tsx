/**
 * A toast on its own: its buttons, Escape, and holding its time while it
 * has the pointer or focus (the timing itself is NotificationContext's).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToastViewport } from '../ToastViewport';
import type { Toast } from '../../../notifications/store';

const toast = (overrides: Partial<Toast> = {}): Toast => ({
  id: 't1',
  key: 'k1',
  severity: 'info',
  message: 'Saved',
  category: 'general',
  actions: [],
  duration: 4000,
  count: 1,
  exiting: false,
  ...overrides,
});

const viewport = (toasts: Toast[]) => {
  const handlers = { onDismiss: vi.fn(), onAction: vi.fn(), onHold: vi.fn(), onRelease: vi.fn() };
  render(<ToastViewport toasts={toasts} {...handlers} />);
  return handlers;
};

describe('ToastViewport', () => {
  it('runs its buttons, and dismisses on Escape only', () => {
    const undo = { label: 'Undo', onClick: vi.fn() };
    const { onAction, onDismiss } = viewport([
      toast({ severity: 'error', title: 'Not saved', actions: [undo], count: 2 }),
    ]);
    const card = screen.getByRole('alert');
    expect(card).toHaveTextContent('Not saved');
    expect(card).toHaveTextContent('×2');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledWith(undo, 't1');

    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(card, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });

  it('holds its time under the pointer, and has a dismiss button', () => {
    const { onHold, onRelease, onDismiss } = viewport([toast()]);
    const card = screen.getByRole('status');

    fireEvent.mouseEnter(card);
    expect(onHold).toHaveBeenCalledWith('t1', 'hover');
    fireEvent.mouseLeave(card);
    expect(onRelease).toHaveBeenCalledWith('t1', 'hover');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });

  it('holds its time while focus is anywhere inside it', () => {
    const { onHold, onRelease } = viewport([toast({ actions: [{ label: 'Open', onClick: vi.fn() }] })]);
    const card = screen.getByRole('status');
    const button = screen.getByRole('button', { name: 'Open' });

    fireEvent.focus(card);
    expect(onHold).toHaveBeenCalledWith('t1', 'focus');
    // Focus moving to its own button keeps it held
    fireEvent.blur(card, { relatedTarget: button });
    expect(onRelease).not.toHaveBeenCalled();
    fireEvent.blur(card, { relatedTarget: document.body });
    expect(onRelease).toHaveBeenCalledWith('t1', 'focus');
  });
});
