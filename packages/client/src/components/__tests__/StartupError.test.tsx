import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { reloadApp } from '../../utils/appReload';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { StartupError } from '../StartupError';

vi.mock('../../utils/appReload', () => ({ reloadApp: vi.fn() }));

describe('StartupError', () => {
  it("names where the data is kept, and offers the shell's ways out", () => {
    const { unmount } = render(<StartupError message="disk unplugged" />);
    expect(screen.getByRole('alert')).toHaveTextContent('appdata.json');
    expect(screen.getByText('disk unplugged')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    unmount();

    installFakeBackendForTest({ capabilities: { dataLocation: 'cloud' } });
    render(<StartupError message="Can't reach the cloud" Actions={() => <button type="button">Sign out</button>} />);
    expect(screen.getByRole('alert')).toHaveTextContent('kept in your TaskMint cloud account');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it("takes a phone's launch screen down, so the error shows", async () => {
    const { hide } = fakeBackend().platform.splashScreen;
    hide.mockClear();
    render(<StartupError message="disk unplugged" />);
    await waitFor(() => expect(hide).toHaveBeenCalledTimes(1));
  });

  it('tries starting again', () => {
    render(<StartupError message="disk unplugged" />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadApp).toHaveBeenCalled();
  });
});
