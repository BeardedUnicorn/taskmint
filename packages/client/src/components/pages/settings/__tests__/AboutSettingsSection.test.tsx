import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AboutSettingsSection } from '../AboutSettingsSection';
import { AboutProvider } from '../../../about/About';
import { NavigationProvider } from '../../../../contexts/NavigationContext';
import { NotificationProvider } from '../../../../contexts/NotificationContext';
import type { ReleaseNotes } from '../../../../utils/changelog';

const state = vi.hoisted(() => ({ version: '2.1.0', releases: [] as ReleaseNotes[] }));
vi.mock('../../../../utils/appVersion', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../utils/appVersion')>()),
  get APP_VERSION() {
    return state.version;
  },
}));
vi.mock('../../../../utils/changelog', () => ({
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
    expect(screen.getByText('Released Nov 08, 2026')).toBeInTheDocument();
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
    expect(older).toHaveTextContent('Nov 07, 2026');
    expect(older).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(older);
    expect(older).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Something new in 2.0.0.')).toBeVisible();

    const first = screen.getByRole('button', { name: '1.0.0' });
    fireEvent.click(first);
    const region = screen.getByRole('region', { name: '1.0.0' });
    expect(within(region).getByText('A bullet with no heading.')).toBeInTheDocument();
    expect(within(region).queryByRole('heading')).not.toBeInTheDocument();
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
    expect(screen.getByRole('dialog', { name: 'TaskMint' })).toHaveTextContent('Version 2.1.0 · Released Nov 08, 2026');
  });
});
