import { describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SettingsPage, SETTINGS_SECTIONS, currentSection } from '../SettingsPage';
import { NavigationProvider, useNavigation } from '../../../contexts/NavigationContext';
import { AppExtensionsProvider } from '../../../app/extensions';
import { installFakeBackendForTest } from '../../../testing';

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
vi.mock('../settings/AboutSettingsSection', () => ({ AboutSettingsSection: () => <div>About section</div> }));

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
    expect(
      within(nav)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(SETTINGS_SECTIONS.map(section => section.label));
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

  it('leaves out the sections this platform has no use for', () => {
    installFakeBackendForTest({ capabilities: { runtime: 'web' }, without: ['idle', 'folderBackups'] });
    render(<SettingsPage />, { wrapper: NavigationProvider });
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const labels = within(nav)
      .getAllByRole('button')
      .map(button => button.textContent);

    expect(labels).not.toContain('Backups');
    expect(labels).not.toContain(SETTINGS_SECTIONS.find(({ id }) => id === 'idle')!.label);
    expect(labels).toHaveLength(SETTINGS_SECTIONS.length - 2);
    expect(screen.queryByText('Idle section')).not.toBeInTheDocument();
    expect(
      screen.getByText("Appearance, payouts, your daily goal, notifications, data and what's new")
    ).toBeInTheDocument();
  });

  it("adds the shell's own sections after the built-in ones, with About last", () => {
    const extensions = {
      settingsSections: [{ id: 'account', label: 'Account', Section: () => <div>Account section</div> }],
    };
    render(
      <AppExtensionsProvider value={extensions}>
        <SettingsPage />
      </AppExtensionsProvider>,
      { wrapper: NavigationProvider }
    );
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });

    expect(
      within(nav)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual([
      ...SETTINGS_SECTIONS.filter(({ id }) => id !== 'about').map(section => section.label),
      'Account',
      'About',
    ]);
    expect(document.getElementById('settings-account')).toHaveTextContent('Account section');
  });

  it('opens at the section asked for, then forgets the request', async () => {
    let params: unknown;
    function OpenAtPayouts() {
      const navigation = useNavigation();
      params = navigation.params;
      useEffect(() => navigation.navigate('settings', { section: 'payouts' }), []); // eslint-disable-line react-hooks/exhaustive-deps
      return <SettingsPage />;
    }
    render(<OpenAtPayouts />, { wrapper: NavigationProvider });

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: 'Payouts' })).toHaveAttribute('aria-current', 'location')
    );
    expect(document.getElementById('settings-payouts')!.scrollIntoView).toHaveBeenCalled();
    expect(params).toEqual({});
  });

  describe('following the scroll', () => {
    const tops: Record<string, number> = { appearance: -600, payouts: 40 };
    const place = () => {
      for (const { id } of SETTINGS_SECTIONS) {
        const element = document.getElementById(`settings-${id}`)!;
        element.getBoundingClientRect = () => ({ top: tops[id] ?? 900 }) as DOMRect;
      }
    };
    const current = () =>
      within(screen.getByRole('navigation', { name: 'Settings sections' }))
        .getAllByRole('button')
        .find(button => button.getAttribute('aria-current') === 'location')?.textContent;

    it('marks the section reached, and the last one at the bottom', async () => {
      const { container } = render(<SettingsPage />, { wrapper: NavigationProvider });
      place();
      const scroller = container.parentElement!;
      Object.defineProperties(scroller, {
        scrollHeight: { value: 2000, configurable: true },
        clientHeight: { value: 500, configurable: true },
        scrollTop: { value: 0, writable: true, configurable: true },
      });

      fireEvent.scroll(scroller);
      await waitFor(() => expect(current()).toBe('Payouts'));

      scroller.scrollTop = 1500;
      fireEvent.scroll(scroller);
      await waitFor(() => expect(current()).toBe(SETTINGS_SECTIONS.at(-1)!.label));
    });

    it('follows a scroll of the window too', async () => {
      render(<SettingsPage />, { wrapper: NavigationProvider });
      place();

      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
      await waitFor(() => expect(current()).not.toBe('Appearance'));
    });

    it('keeps the section clicked while the page scrolls there', async () => {
      const { container } = render(<SettingsPage />, { wrapper: NavigationProvider });
      place();
      fireEvent.click(screen.getByRole('button', { name: 'Backups' }));

      fireEvent.scroll(container.parentElement!);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(current()).toBe('Backups');
    });
  });
});
