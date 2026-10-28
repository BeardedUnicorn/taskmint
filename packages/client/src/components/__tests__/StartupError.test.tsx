import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { installFakeBackendForTest } from '../../testing';
import { StartupError } from '../StartupError';

describe('StartupError', () => {
  it("names where the data is kept, and offers the shell's ways out", () => {
    const { unmount } = render(<StartupError message="disk unplugged" />);
    expect(screen.getByRole('alert')).toHaveTextContent('appdata.json');
    expect(screen.getByText('disk unplugged')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    unmount();

    installFakeBackendForTest({ capabilities: { dataLocation: 'server' } });
    render(
      <StartupError
        message="Can't reach the TaskMint server"
        Actions={() => <button type="button">Use the data on this computer</button>}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('kept on your TaskMint server');
    expect(screen.getByRole('button', { name: 'Use the data on this computer' })).toBeInTheDocument();
  });
});
