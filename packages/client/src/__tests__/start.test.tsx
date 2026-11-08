import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { startClient } from '../start';
import { getBackend } from '../backend';
import { useAppExtensions } from '../app/extensions';
import { readAppRecord } from '../services/appRecords';
import { asBackend, createFakeBackend, installFakeBackend } from '../testing';

vi.mock('../utils/sentry', () => ({ initSentry: vi.fn() }));
vi.mock('../App', () => ({
  default: function FakeApp() {
    const { settingsSections = [] } = useAppExtensions();
    return <p>app with {settingsSections.map(section => section.label).join(', ')}</p>;
  },
}));

const Account = () => null;

function container() {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return element;
}

describe('startClient', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    installFakeBackend();
  });

  it("makes the shell's backend the page's, loads the records, then renders the app with its extensions", async () => {
    const backend = createFakeBackend();
    backend.call.mockResolvedValue({ records: { dailyGoal: { targetAmount: 50 } }, revisions: {} });

    await act(() =>
      startClient(container(), {
        backend: asBackend(backend),
        extensions: { settingsSections: [{ id: 'account', label: 'Account', Section: Account }] },
      })
    );

    expect(getBackend()).toBe(backend);
    expect(backend.call).toHaveBeenCalledWith('get_app_records');
    expect(readAppRecord('dailyGoal')).toEqual({ targetAmount: 50 });
    expect(screen.getByText('app with Account')).toBeInTheDocument();
  });

  it("shows why it couldn't start when the records can't be read", async () => {
    const backend = createFakeBackend();
    backend.call.mockRejectedValue('appdata.json is corrupt');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(() => startClient(container(), { backend: asBackend(backend), extensions: {} }));

    expect(screen.getByRole('alert')).toHaveTextContent('appdata.json is corrupt');
    expect(screen.queryByText(/app with/)).not.toBeInTheDocument();
    error.mockRestore();
  });

  it("says the records are on the server when that's where they live", async () => {
    const backend = createFakeBackend({ capabilities: { runtime: 'web', dataLocation: 'server' } });
    backend.call.mockRejectedValue("Can't reach the TaskMint server");
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(() => startClient(container(), { backend: asBackend(backend), extensions: {} }));

    expect(screen.getByRole('alert')).toHaveTextContent('kept on your TaskMint server');
    expect(screen.getByRole('alert')).not.toHaveTextContent('appdata.json');
    error.mockRestore();
  });
});
