import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeProvider } from '../../../../contexts/ThemeContext';
import { AppearanceSettingsSection } from '../AppearanceSettingsSection';

function storedThemeMode(): string | null {
  const raw = window.localStorage.getItem('theme-mode');
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return parsed?.version ? parsed.data : parsed;
}

describe('AppearanceSettingsSection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('offers Light, Dark and System, with Dark selected by default', () => {
    render(
      <ThemeProvider>
        <AppearanceSettingsSection />
      </ThemeProvider>
    );

    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveClass('MuiButton-contained');
  });

  it('saves the chosen theme', () => {
    render(
      <ThemeProvider>
        <AppearanceSettingsSection />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));

    expect(storedThemeMode()).toBe('light');
    expect(screen.getByRole('button', { name: 'Light' })).toHaveClass('MuiButton-contained');
  });
});
