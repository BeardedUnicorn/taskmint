import { beforeEach, describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SettingsPage, SETTINGS_SECTIONS, currentSection } from '../SettingsPage';
import { NavigationProvider, useNavigation } from '../../../contexts/NavigationContext';
import { AppExtensionsProvider } from '../../../app/extensions';
import { fakeBackend, installFakeBackendForTest } from '../../../testing';
import { setPhoneViewport } from '../../../__tests__/setup/viewport';
import { useBackButton } from '../../../navigation/backButton';
import { useOpenedFromLink } from '../settings/settingsLink';

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
vi.mock('../settings/AboutSettingsSection', () => ({
  AboutSettingsSection: () => <div>About section{useOpenedFromLink() ? ', opened from a link' : ''}</div>,
}));
vi.mock('../settings/CloudSyncSection', () => ({ CloudSyncSection: () => <div>Sync section</div> }));

// A build that syncs, unless a test says otherwise
const cloud = vi.hoisted(() => ({ syncs: true }));
vi.mock('../../../cloud', () => ({ syncsThisDevice: () => cloud.syncs }));
beforeEach(() => {
  cloud.syncs = true;
});

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
    cloud.syncs = false;
    render(<SettingsPage />, { wrapper: NavigationProvider });
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const labels = within(nav)
      .getAllByRole('button')
      .map(button => button.textContent);

    expect(labels).not.toContain('Backups');
    expect(labels).not.toContain(SETTINGS_SECTIONS.find(({ id }) => id === 'idle')!.label);
    expect(labels).not.toContain('Cloud sync');
    expect(labels).toHaveLength(SETTINGS_SECTIONS.length - 3);
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

  describe('on a phone', () => {
    /** The shell's part in Android's back, beside the page. */
    function WithBack({ children }: { children: React.ReactNode }) {
      useBackButton();
      return <>{children}</>;
    }

    it('lists the sections, and opens each on its own screen with a way back', async () => {
      setPhoneViewport();
      render(
        <NavigationProvider>
          <WithBack>
            <SettingsPage />
          </WithBack>
        </NavigationProvider>
      );
      const list = screen.getByRole('navigation', { name: 'Settings sections' });
      expect(
        within(list)
          .getAllByRole('button')
          .map(button => button.textContent)
      ).toEqual(SETTINGS_SECTIONS.map(section => section.label));
      expect(screen.queryByText('Appearance section')).not.toBeInTheDocument();

      fireEvent.click(within(list).getByRole('button', { name: 'Payouts' }));
      expect(screen.getByText('Payouts section')).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Settings sections' })).not.toBeInTheDocument();
      expect(screen.queryByText('Appearance section')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();

      // Android's back goes from a section to the list
      fireEvent.click(screen.getByRole('button', { name: 'About' }));
      expect(screen.getByText('About section')).toBeInTheDocument();
      await waitFor(() => expect(fakeBackend().platform.backButton.listen).toHaveBeenCalled());
      act(() => fakeBackend().pressBack());
      expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();
    });

    it('opens at the section a link asks for, telling it a link opened it', async () => {
      setPhoneViewport();
      function OpenAt({ section }: { section: 'about' | 'backups' }) {
        const navigation = useNavigation();
        useEffect(() => navigation.navigate('settings', { section }), []); // eslint-disable-line react-hooks/exhaustive-deps
        return <SettingsPage />;
      }
      const { unmount } = render(<OpenAt section="about" />, { wrapper: NavigationProvider });
      expect(await screen.findByText('About section, opened from a link')).toBeInTheDocument();
      unmount();

      // A section this platform doesn't have stays on the list
      installFakeBackendForTest({ capabilities: { runtime: 'mobile' }, without: ['idle', 'folderBackups'] });
      render(<OpenAt section="backups" />, { wrapper: NavigationProvider });
      await waitFor(() => expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument());
      expect(screen.queryByText('Backups section')).not.toBeInTheDocument();
    });
  });
});
