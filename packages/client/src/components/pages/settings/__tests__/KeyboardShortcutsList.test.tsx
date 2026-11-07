import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { KeyboardShortcutsList } from '../KeyboardShortcutsList';
import { installFakeBackendForTest } from '../../../../testing';

describe('KeyboardShortcutsList', () => {
  it('lists every shortcut in the desktop app', () => {
    render(<KeyboardShortcutsList />);
    expect(screen.getByText('New task')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('leaves out the ones a browser keeps for itself', () => {
    installFakeBackendForTest({ capabilities: { runtime: 'web' } });
    render(<KeyboardShortcutsList />);
    expect(screen.queryByText('New task')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.getByText(/Command palette/)).toBeInTheDocument();
  });
});
