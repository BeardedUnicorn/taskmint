import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SettingsPage, SETTINGS_SECTIONS, currentSection } from '../SettingsPage';
import { NavigationProvider } from '../../../contexts/NavigationContext';

// The sections have their own tests; here they're placeholders
vi.mock('../settings', () => ({
  AppearanceSettingsSection: () => <div>Appearance section</div>,
  BackupSettingsSection: () => <div>Backups section</div>,
  DailyGoalSettings: () => <div>Goal section</div>,
  DataManagementSection: () => <div>Data section</div>,
  PrivacySettingsSection: () => <div>Privacy section</div>,
}));
vi.mock('../settings/InactivitySettingsSection', () => ({ InactivitySettingsSection: () => <div>Idle section</div> }));
vi.mock('../settings/NotificationSettingsSection', () => ({
  NotificationSettingsSection: () => <div>Notifications section</div>,
}));
vi.mock('../settings/PayoutSettingsSection', () => ({ PayoutSettingsSection: () => <div>Payouts section</div> }));

describe('currentSection', () => {
  it('is the last section whose top has reached the top of the window', () => {
    expect(currentSection([-900, -300, 40, 700], false)).toBe(2);
  });

  it('is the first section before anything has scrolled', () => {
    expect(currentSection([24, 500, 900], false)).toBe(0);
  });

  it('is the last section once the page is scrolled to the bottom', () => {
    expect(currentSection([-900, -300, 200, 450], true)).toBe(3);
  });
});

describe('SettingsPage', () => {
  it('lists every section, and each has its anchor', () => {
    render(<SettingsPage />, { wrapper: NavigationProvider });
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual(
      SETTINGS_SECTIONS.map(section => section.label)
    );
    for (const { id } of SETTINGS_SECTIONS) {
      expect(document.getElementById(`settings-${id}`)).toBeInTheDocument();
    }
  });

  it('marks the section clicked in the list as current', () => {
    render(<SettingsPage />, { wrapper: NavigationProvider });
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'location');

    fireEvent.click(within(nav).getByRole('button', { name: 'Backups' }));

    expect(within(nav).getByRole('button', { name: 'Backups' })).toHaveAttribute('aria-current', 'location');
    expect(within(nav).getByRole('button', { name: 'Appearance' })).not.toHaveAttribute('aria-current');
  });
});
