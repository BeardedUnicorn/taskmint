import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InactivitySettingsSection } from '../InactivitySettingsSection';
import { NotificationProvider } from '../../../../contexts/NotificationContext';
import { STORAGE_KEYS } from '../../../../constants';
import { fakeBackend, installFakeBackendForTest } from '../../../../testing';

const idle = () => fakeBackend().platform.idle;

function renderSection() {
  return render(<InactivitySettingsSection />, { wrapper: NotificationProvider });
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
    idle().isSupported.mockResolvedValue(true);
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

  it('applies a change right away and sends it to the idle monitor', async () => {
    renderSection();

    fireEvent.click(screen.getByRole('switch', { name: /Enable Inactivity Detection/ }));

    await waitFor(() =>
      expect(idle().setSettings).toHaveBeenCalledWith({ enabled: true, thresholdMinutes: 15, longRunHours: 4 })
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
      expect(idle().setSettings).toHaveBeenCalledWith({ enabled: false, thresholdMinutes: 15, longRunHours: 2 })
    );
  });

  it('says so, and stays off, where the system reports no idle time', async () => {
    idle().isSupported.mockResolvedValue(false);
    renderSection();

    expect(await screen.findByText(/doesn't report idle time/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Enable Inactivity Detection/ })).toBeDisabled();
  });

  it('says so where the platform has no idle detection at all', () => {
    installFakeBackendForTest({ without: ['idle'] });
    renderSection();

    expect(screen.getByText(/doesn't report idle time/)).toBeInTheDocument();
  });

  it('assumes idle time is there when asking fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    idle().isSupported.mockRejectedValue('no monitor');
    renderSection();

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Failed to ask whether idle time is available:', 'no monitor')
    );
    expect(screen.queryByText(/doesn't report idle time/)).not.toBeInTheDocument();
    warn.mockRestore();
  });
});
