import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../../__tests__/setup/test-helpers';
import { AboutProvider, useAbout } from '../About';
import { NavigationProvider } from '../../../contexts/NavigationContext';

// A build whose version has no CHANGELOG section yet
vi.mock('../../../utils/changelog', () => ({ RELEASES: [] }));

function Opener() {
  const { openAbout } = useAbout();
  return (
    <button type="button" onClick={() => openAbout()}>
      Open About
    </button>
  );
}

describe('About TaskMint, before its version is released', () => {
  it('shows the version without a release date', async () => {
    render(
      <NavigationProvider>
        <AboutProvider>
          <Opener />
        </AboutProvider>
      </NavigationProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open About' }));
    expect(await screen.findByText(/^Version [\d.]+$/)).toBeInTheDocument();
  });
});
