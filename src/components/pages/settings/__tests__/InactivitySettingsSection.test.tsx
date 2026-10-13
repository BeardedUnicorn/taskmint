import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InactivitySettingsSection } from '../InactivitySettingsSection';
import { STORAGE_KEYS } from '../../../../constants';
import { safeInvoke } from '../../../../utils/tauri';

vi.mock('../../../../utils/tauri', () => ({
  isTauriEnvironment: vi.fn(() => true),
  safeInvoke: vi.fn(),
}));

const mockSafeInvoke = vi.mocked(safeInvoke);

function renderSection() {
  return render(<InactivitySettingsSection onSuccess={() => {}} onError={() => {}} />);
}

function storeSettings(data: Record<string, unknown>) {
  // The one-time off-by-default migration already ran on this install
  window.localStorage.setItem(STORAGE_KEYS.INACTIVITY_DEFAULT_OFF_APPLIED, 'true');
  window.localStorage.setItem(STORAGE_KEYS.INACTIVITY_SETTINGS, JSON.stringify({ version: 1, data }));
}

describe('InactivitySettingsSection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mockSafeInvoke.mockImplementation(async (command: string) =>
      command === 'get_idle_support' ? true : null
    );
  });

  it('starts off and explains that any app counts as activity', () => {
    renderSection();

    expect(screen.getByRole('switch', { name: /Enable Inactivity Detection/ })).not.toBeChecked();
    expect(screen.getByText(/no keyboard or mouse input for this long, in any app/)).toBeInTheDocument();
  });

  it('offers only the threshold: no warning countdown, auto-resume or testing mode', () => {
    storeSettings({
      enabled: true,
      thresholdMinutes: 15,
      // Keys older builds saved; the controls for them are gone
      showWarningBeforePause: true,
      warningDurationSeconds: 30,
      resumeOnActivity: true,
      testingMode: true,
    });
    renderSection();

    expect(screen.getByRole('slider', { name: 'Inactivity threshold' })).toBeInTheDocument();
    expect(screen.getByText('Pause after 15 minutes without input')).toBeInTheDocument();
    expect(screen.queryByText(/Show Warning Before Auto-Pause/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Auto-Resume on Activity/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Testing Mode/)).not.toBeInTheDocument();
  });

  it('applies a change right away and sends it to the backend monitor', async () => {
    renderSection();

    fireEvent.click(screen.getByRole('switch', { name: /Enable Inactivity Detection/ }));

    await waitFor(() =>
      expect(mockSafeInvoke).toHaveBeenCalledWith('set_idle_settings', {
        settings: { enabled: true, thresholdMinutes: 15, longRunHours: 4 },
      })
    );
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.INACTIVITY_SETTINGS)!);
    expect(stored.data).toEqual({ enabled: true, thresholdMinutes: 15, longRunHours: 4 });
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
  });

  it('sets the long-run reminder, which works with detection off', async () => {
    renderSection();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Remind me after a timer runs' }));
    fireEvent.click(screen.getByRole('option', { name: '2 hours straight' }));

    await waitFor(() =>
      expect(mockSafeInvoke).toHaveBeenCalledWith('set_idle_settings', {
        settings: { enabled: false, thresholdMinutes: 15, longRunHours: 2 },
      })
    );
  });

  it('says so, and stays off, where the system reports no idle time', async () => {
    mockSafeInvoke.mockImplementation(async (command: string) =>
      command === 'get_idle_support' ? false : null
    );
    renderSection();

    expect(await screen.findByText(/doesn't report idle time/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Enable Inactivity Detection/ })).toBeDisabled();
  });
});
