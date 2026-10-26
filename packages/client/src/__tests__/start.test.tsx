import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { startClient } from '../start';
import { getBackend } from '../backend';
import { useAppExtensions } from '../app/extensions';
import { readAppRecord } from '../services/appRecords';
import { createFakeBackend, installFakeBackend } from '../testing';

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
    backend.call.mockResolvedValue({ records: { dailyGoal: { targetAmount: 50 } } });
    localStorage.setItem('userSubscription', 'pro');

    await act(() =>
      startClient(container(), {
        backend,
        extensions: { settingsSections: [{ id: 'account', label: 'Account', Section: Account }] },
        importLegacyRecords: false,
      })
    );

    expect(getBackend()).toBe(backend);
    expect(backend.call).toHaveBeenCalledWith('get_app_records');
    expect(readAppRecord('dailyGoal')).toEqual({ targetAmount: 50 });
    expect(localStorage.getItem('userSubscription')).toBeNull();
    expect(screen.getByText('app with Account')).toBeInTheDocument();
  });

  it("moves an older version's records in when the shell asks", async () => {
    const backend = createFakeBackend();
    backend.call.mockResolvedValue({ records: {} });
    localStorage.setItem('predefinedTasks', JSON.stringify([{ id: 't1' }]));

    await act(() => startClient(container(), { backend, extensions: {}, importLegacyRecords: true }));

    expect(backend.call).toHaveBeenCalledWith('import_app_records', { records: { predefinedTasks: [{ id: 't1' }] } });
  });

  it("shows why it couldn't start when the records can't be read", async () => {
    const backend = createFakeBackend();
    backend.call.mockRejectedValue('appdata.json is corrupt');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(() => startClient(container(), { backend, extensions: {}, importLegacyRecords: false }));

    expect(screen.getByRole('alert')).toHaveTextContent('appdata.json is corrupt');
    expect(screen.queryByText(/app with/)).not.toBeInTheDocument();
    error.mockRestore();
  });

  it('starts even when storage refuses the cleanup', async () => {
    const backend = createFakeBackend();
    backend.call.mockResolvedValue({ records: {} });
    vi.mocked(localStorage.removeItem).mockImplementationOnce(() => {
      throw new Error('storage disabled');
    });

    await act(() => startClient(container(), { backend, extensions: {}, importLegacyRecords: false }));

    expect(screen.getByText('app with')).toBeInTheDocument();
  });
});
