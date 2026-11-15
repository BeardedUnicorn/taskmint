import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AboutSettingsSection } from '../AboutSettingsSection';
import { AboutProvider } from '../../../about/About';
import { NavigationProvider } from '../../../../contexts/NavigationContext';
import { NotificationProvider } from '../../../../contexts/NotificationContext';
import type { ReleaseNotes } from '../../../../utils/changelog';
import { setPhoneViewport } from '../../../../__tests__/setup/viewport';
import { SettingsLinkContext } from '../settingsLink';

const state = vi.hoisted(() => ({ version: '2.1.0', releases: [] as ReleaseNotes[] }));
vi.mock('../../../../utils/appVersion', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../utils/appVersion')>()),
  get APP_VERSION() {
    return state.version;
  },
}));
vi.mock('../../../../utils/changelog', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../utils/changelog')>()),
  get RELEASES() {
    return state.releases;
  },
}));

const release = (version: string, date: string | null, overrides: Partial<ReleaseNotes> = {}): ReleaseNotes => ({
  version,
  date,
  intro: [],
  groups: [{ type: 'Added', items: [`Something new in ${version}.`] }],
  ...overrides,
});

describe('AboutSettingsSection', () => {
  beforeEach(() => {
    state.version = '2.1.0';
    state.releases = [];
  });

  it("shows the version, when it was released, and what's new in it", () => {
    state.releases = [
      release('2.1.0', '2026-11-08', {
        intro: ['A release with `code` in it.'],
        groups: [
          { type: 'Added', items: ['Settings → About.', '**Stop syncing** is now **Sign out**.'] },
          { type: 'Fixed', items: ['A fix for `taskmint://` links.'] },
        ],
      }),
      release('2.0.0', '2026-11-07'),
    ];
    render(<AboutSettingsSection />);

    expect(screen.getByText('TaskMint 2.1.0')).toBeInTheDocument();
    expect(screen.getByText('Released Nov 8, 2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "What's new in 2.1.0" })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Added' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fixed' })).toBeInTheDocument();
    expect(screen.getByText('Settings → About.')).toBeInTheDocument();
    expect(screen.getByText('taskmint://').tagName).toBe('CODE');
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getByText(/A release with/)).toBeInTheDocument();
    // The changelog's Markdown bold, without its asterisks
    expect(screen.getByText('Stop syncing').tagName).toBe('STRONG');
    expect(screen.getByText('Sign out').tagName).toBe('STRONG');
    expect(screen.getByText(/is now/).textContent).toBe('Stop syncing is now Sign out.');
  });

  it('lists the earlier releases, collapsed until opened', () => {
    state.releases = [
      release('2.1.0', '2026-11-08'),
      release('2.0.0', '2026-11-07'),
      release('1.0.0', null, { groups: [{ type: '', items: ['A bullet with no heading.'] }] }),
    ];
    render(<AboutSettingsSection />);

    expect(screen.getByRole('heading', { name: 'Earlier releases' })).toBeInTheDocument();
    const older = screen.getByRole('button', { name: /^2\.0\.0/ });
    expect(older).toHaveTextContent('Nov 7, 2026');
    expect(older).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(older);
    expect(older).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Something new in 2.0.0.')).toBeVisible();

    // An older major version's releases stay folded under it
    expect(screen.queryByRole('button', { name: '1.0.0' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Version 1/ }));
    const first = screen.getByRole('button', { name: '1.0.0' });
    fireEvent.click(first);
    const region = screen.getByRole('region', { name: '1.0.0' });
    expect(within(region).getByText('A bullet with no heading.')).toBeInTheDocument();
    expect(within(region).queryByRole('heading')).not.toBeInTheDocument();
  });

  it('folds the earlier releases under their major versions, the newest open', () => {
    state.version = '3.1.0';
    state.releases = [
      release('3.1.0', '2026-11-12'),
      release('3.0.0', '2026-11-10'),
      release('2.1.0', '2026-11-08'),
      release('2.0.0', '2026-11-07'),
      release('1.1.0', '2026-11-01'),
      release('1.0.0', '2026-11-01'),
      release('0.1.0', null),
    ];
    render(<AboutSettingsSection />);

    const newest = screen.getByRole('button', { name: /^Version 3/ });
    expect(newest).toHaveAttribute('aria-expanded', 'true');
    expect(newest).toHaveTextContent('1 release · Nov 10, 2026');
    expect(
      within(screen.getByRole('group', { name: /^Version 3/ })).getByRole('button', { name: /^3\.0\.0/ })
    ).toBeInTheDocument();

    const older = screen.getByRole('button', { name: /^Version 2/ });
    expect(older).toHaveAttribute('aria-expanded', 'false');
    expect(older).toHaveTextContent('2 releases · Nov 7, 2026 – Nov 8, 2026');
    expect(screen.queryByRole('button', { name: /^2\.1\.0/ })).not.toBeInTheDocument();
    fireEvent.click(older);
    expect(older).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^2\.1\.0/ })).toBeInTheDocument();
    // Opening one leaves the others as they were
    expect(newest).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(newest);
    expect(newest).toHaveAttribute('aria-expanded', 'false');

    // Released on one day, and with no dates at all
    expect(screen.getByRole('button', { name: /^Version 1/ })).toHaveTextContent('2 releases · Nov 1, 2026');
    expect(screen.getByRole('button', { name: /^Version 0/ }).textContent).toBe('Version 01 release');
    // Nothing to page through
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it("shows a major version's releases five at a time", () => {
    state.version = '2.7.0';
    state.releases = [7, 6, 5, 4, 3, 2, 1, 0].map(minor => release(`2.${minor}.0`, '2026-11-08'));
    render(<AboutSettingsSection />);

    const shown = () =>
      within(screen.getByRole('group', { name: /^Version 2/ }))
        .getAllByRole('button', { name: /^2\.\d\.0/ })
        .map(button => button.textContent?.slice(0, 5));
    expect(shown()).toEqual(['2.6.0', '2.5.0', '2.4.0', '2.3.0', '2.2.0']);

    const pages = screen.getByRole('navigation', { name: 'Version 2 releases, by page' });
    fireEvent.click(within(pages).getByRole('button', { name: 'Go to page 2' }));
    expect(shown()).toEqual(['2.1.0', '2.0.0']);
    fireEvent.click(within(pages).getByRole('button', { name: 'Go to previous page' }));
    expect(shown()).toEqual(['2.6.0', '2.5.0', '2.4.0', '2.3.0', '2.2.0']);
  });

  it('leaves out a release newer than this one', () => {
    state.version = '2.0.0';
    state.releases = [release('2.1.0', '2026-11-08'), release('2.0.0', '2026-11-07')];
    render(<AboutSettingsSection />);

    expect(screen.queryByText('Something new in 2.1.0.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Earlier releases' })).not.toBeInTheDocument();
  });

  it('says so when this version has no notes', () => {
    state.version = '2.2.0';
    state.releases = [release('2.1.0', '2026-11-08')];
    render(<AboutSettingsSection />);

    expect(screen.getByText('There are no release notes for this version.')).toBeInTheDocument();
    expect(screen.queryByText(/^Released/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^2\.1\.0/ })).toBeInTheDocument();
  });

  it("leaves out the release date when the notes don't have one", () => {
    state.releases = [release('2.1.0', null)];
    render(<AboutSettingsSection />);

    expect(screen.getByText('Something new in 2.1.0.')).toBeInTheDocument();
    expect(screen.queryByText(/^Released/)).not.toBeInTheDocument();
  });

  it('opens About TaskMint from its header, where the app has the dialog', () => {
    state.releases = [release('2.1.0', '2026-11-08')];
    const { unmount } = render(<AboutSettingsSection />);
    expect(screen.queryByRole('button', { name: 'About TaskMint…' })).not.toBeInTheDocument();
    unmount();

    render(
      <NavigationProvider>
        <NotificationProvider>
          <AboutProvider>
            <AboutSettingsSection />
          </AboutProvider>
        </NotificationProvider>
      </NavigationProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'About TaskMint…' }));
    expect(screen.getByRole('dialog', { name: 'TaskMint' })).toHaveTextContent('Version 2.1.0 · Released Nov 8, 2026');
  });

  it("folds this version's notes away on a phone, unless a What's new link opened About", () => {
    setPhoneViewport();
    state.releases = [release('2.1.0', '2026-11-08')];
    const { unmount } = render(<AboutSettingsSection />);
    const toggle = screen.getByRole('button', { name: "What's new in 2.1.0" });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Something new in 2.1.0.')).toBeInTheDocument();
    unmount();

    render(
      <SettingsLinkContext.Provider value>
        <AboutSettingsSection />
      </SettingsLinkContext.Provider>
    );
    expect(screen.getByRole('button', { name: "What's new in 2.1.0" })).toHaveAttribute('aria-expanded', 'true');
  });
});
