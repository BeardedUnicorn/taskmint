import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InactivitySettingsSection } from '../InactivitySettingsSection';
import { STORAGE_KEYS } from '../../../../constants';
import { DEFAULT_INACTIVITY_SETTINGS } from '../../../../types/timer';

function renderSection() {
  return render(<InactivitySettingsSection onSuccess={() => {}} onError={() => {}} />);
}

describe('InactivitySettingsSection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts off, and says it only sees activity inside the TaskMint window', () => {
    renderSection();

    expect(screen.getByRole('switch', { name: /Enable Inactivity Detection/ })).not.toBeChecked();
    expect(screen.getByText(/Only activity inside the TaskMint window counts/)).toBeInTheDocument();
  });

  describe('Development Testing Mode', () => {
    // Turned on by the user after the one-time off-by-default migration, so
    // the detailed options (including Testing Mode) are visible
    beforeEach(() => {
      window.localStorage.setItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED, 'true');
      window.localStorage.setItem(
        STORAGE_KEYS.INACTIVITY_SETTINGS,
        JSON.stringify({ version: 1, data: { ...DEFAULT_INACTIVITY_SETTINGS, enabled: true } })
      );
    });

    it('is hidden in release builds', () => {
      vi.stubEnv('DEV', false);
      renderSection();

      expect(screen.getByRole('switch', { name: /Enable Inactivity Detection/ })).toBeChecked();
      expect(screen.queryByText('Development Testing Mode')).not.toBeInTheDocument();
    });

    it('is available in development builds', () => {
      vi.stubEnv('DEV', true);
      renderSection();

      fireEvent.click(screen.getByRole('switch', { name: /Development Testing Mode/ }));

      expect(screen.getByText(/Testing Mode Active/)).toBeInTheDocument();
    });
  });
});
