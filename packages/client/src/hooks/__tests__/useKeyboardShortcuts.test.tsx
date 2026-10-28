import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, renderHook, fireEvent } from '@testing-library/react';
import { ReactNode } from 'react';
import { Dialog } from '@mui/material';
import { shortcutFor, useKeyboardShortcuts, modifierLabel, viewShortcut } from '../useKeyboardShortcuts';
import { NavigationProvider, useNavigation } from '../../contexts/NavigationContext';

const press = (key: string, mods: Partial<KeyboardEvent> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  ...mods,
});

describe('shortcutFor', () => {
  it('uses ⌘ on macOS and Ctrl elsewhere', () => {
    expect(shortcutFor(press('1', { metaKey: true }), true)).toEqual({ type: 'view', view: 'sessions' });
    expect(shortcutFor(press('1', { ctrlKey: true }), true)).toBeNull();
    expect(shortcutFor(press('1', { ctrlKey: true }), false)).toEqual({ type: 'view', view: 'sessions' });
    expect(shortcutFor(press('1', { metaKey: true }), false)).toBeNull();
  });

  it('maps 1–7 to the pages in sidebar order, and nothing past them', () => {
    expect(shortcutFor(press('7', { metaKey: true }), true)).toEqual({ type: 'view', view: 'settings' });
    expect(shortcutFor(press('4', { metaKey: true }), true)).toEqual({ type: 'view', view: 'history' });
    expect(shortcutFor(press('8', { metaKey: true }), true)).toBeNull();
    expect(shortcutFor(press('0', { metaKey: true }), true)).toBeNull();
  });

  it('knows N, comma and K', () => {
    expect(shortcutFor(press('n', { metaKey: true }), true)).toEqual({ type: 'new-task' });
    expect(shortcutFor(press(',', { metaKey: true }), true)).toEqual({ type: 'settings' });
    expect(shortcutFor(press('K', { metaKey: true }), true)).toEqual({ type: 'palette' });
  });

  it('leaves N and comma to the browser in the web app', () => {
    expect(shortcutFor(press('n', { metaKey: true }), true, true)).toBeNull();
    expect(shortcutFor(press(',', { metaKey: true }), true, true)).toBeNull();
    expect(shortcutFor(press('k', { metaKey: true }), true, true)).toEqual({ type: 'palette' });
    expect(shortcutFor(press('2', { metaKey: true }), true, true)).toEqual({ type: 'view', view: 'tasks' });
  });

  it('ignores repeats, typing in an input method, and other modifiers', () => {
    expect(shortcutFor(press('k', { metaKey: true, repeat: true }), true)).toBeNull();
    expect(shortcutFor(press('k', { metaKey: true, isComposing: true }), true)).toBeNull();
    expect(shortcutFor(press('n', { metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(shortcutFor(press('n', { metaKey: true, altKey: true }), true)).toBeNull();
    expect(shortcutFor(press('k'), true)).toBeNull();
  });
});

describe('shortcut labels', () => {
  it('reads ⌘ on macOS and Ctrl+ elsewhere', () => {
    expect(modifierLabel(true)).toBe('⌘');
    expect(modifierLabel(false)).toBe('Ctrl+');
    expect(viewShortcut('payouts', true)).toBe('⌘6');
  });
});

describe('useKeyboardShortcuts', () => {
  // jsdom reports no platform; Ctrl is the modifier there
  const ctrl = (key: string) => fireEvent.keyDown(window, { key, ctrlKey: true });

  let onTogglePalette: Mock<() => void>;
  beforeEach(() => {
    onTogglePalette = vi.fn();
  });

  const setup = (paletteOpen = false) =>
    renderHook(
      () => {
        useKeyboardShortcuts({ paletteOpen, onTogglePalette });
        return useNavigation();
      },
      { wrapper: ({ children }: { children: ReactNode }) => <NavigationProvider>{children}</NavigationProvider> }
    );

  it('switches pages, opens Settings and asks for a new task', () => {
    const { result } = setup();

    ctrl('3');
    expect(result.current.view).toBe('notes');
    ctrl(',');
    expect(result.current.view).toBe('settings');
    ctrl('n');
    expect(result.current.view).toBe('tasks');
    expect(result.current.params).toEqual({ intent: 'new-task' });
  });

  it('opens the palette, and leaves other keys alone', () => {
    const { result } = setup();
    ctrl('x');
    fireEvent.keyDown(window, { key: '2' });
    expect(result.current.view).toBe('sessions');
    ctrl('k');
    expect(onTogglePalette).toHaveBeenCalledTimes(1);
  });

  it('only closes the palette while it is open', () => {
    const { result } = setup(true);
    ctrl('2');
    expect(result.current.view).toBe('sessions');
    ctrl('k');
    expect(onTogglePalette).toHaveBeenCalledTimes(1);
  });

  it('waits while a dialog is open', () => {
    const { result } = setup();
    render(
      <Dialog open>
        <div>Editing</div>
      </Dialog>
    );

    ctrl('2');
    ctrl('k');
    expect(result.current.view).toBe('sessions');
    expect(onTogglePalette).not.toHaveBeenCalled();
  });
});
