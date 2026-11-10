import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { startClient } from '../start';
import { getBackend } from '../backend';
import { useAppExtensions } from '../app/extensions';
import { readAppRecord } from '../services/appRecords';
import { asBackend, createFakeBackend, installFakeBackend } from '../testing';

vi.mock('../utils/sentry', () => ({ initSentry: vi.fn() }));
const cloud = vi.hoisted(() => ({ startCloudSync: vi.fn() }));
vi.mock('../cloud', () => cloud);
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
    // Without a Firebase app, nothing syncs
    expect(cloud.startCloudSync).not.toHaveBeenCalled();
  });

  it("starts cloud sync when the shell's build has a Firebase app", async () => {
    const backend = createFakeBackend();
    backend.call.mockResolvedValue({ records: {}, revisions: {} });
    const config = { persistentCache: false, popupSignIn: false } as never;
    const firstSync = vi.fn(async () => undefined);
    cloud.startCloudSync.mockReturnValue({ firstSync });
    await act(() => startClient(container(), { backend: asBackend(backend), extensions: {}, cloud: config }));
    expect(cloud.startCloudSync).toHaveBeenCalledWith(backend, config, undefined);
    // The data is on this device: nothing to wait for
    expect(firstSync).not.toHaveBeenCalled();
  });

  it('waits for the cloud where the data lives only there, with the store the shell loaded', async () => {
    const backend = createFakeBackend({ capabilities: { runtime: 'web', dataLocation: 'cloud' } });
    const order: string[] = [];
    const firstSync = vi.fn(async () => {
      order.push('synced');
    });
    backend.call.mockImplementation(async () => {
      order.push('records');
      return { records: {}, revisions: {} };
    });
    cloud.startCloudSync.mockReturnValue({ firstSync });
    const store = async () => ({}) as never;
    const config = { persistentCache: true, popupSignIn: true } as never;
    await act(() =>
      startClient(container(), { backend: asBackend(backend), extensions: {}, cloud: config, cloudStore: store })
    );
    expect(cloud.startCloudSync).toHaveBeenCalledWith(backend, config, store);
    expect(order[0]).toBe('synced');

    // A web page without a Firebase app waits for nothing
    await act(() => startClient(container(), { backend: asBackend(backend), extensions: {} }));
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

  it("says the records are in the cloud when that's where they live", async () => {
    const backend = createFakeBackend({ capabilities: { runtime: 'web', dataLocation: 'cloud' } });
    backend.call.mockRejectedValue("Can't reach the cloud");
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(() => startClient(container(), { backend: asBackend(backend), extensions: {} }));

    expect(screen.getByRole('alert')).toHaveTextContent('kept in your TaskMint cloud account');
    expect(screen.getByRole('alert')).not.toHaveTextContent('appdata.json');
    error.mockRestore();
  });
});
