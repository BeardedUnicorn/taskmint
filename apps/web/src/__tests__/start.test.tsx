import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { startClient } from '@taskmint/client/start';
import { bea, createFakeBackend, createFakeCloudStore, asBackend } from '@taskmint/client/testing';
import { start, SignInPage } from '../start';
import { createWasmBackend } from '../wasmBackend';
import { render } from '@testing-library/react';

vi.mock('@taskmint/client/start', () => ({ startClient: vi.fn(async () => undefined) }));
// The defaults: Firebase's SDK and the WebAssembly core, stood in for
const defaults = vi.hoisted(() => ({ store: null as unknown, backend: { capabilities: {} } }));
vi.mock('@taskmint/client/cloud', async original => ({
  ...(await original<typeof import('@taskmint/client/cloud')>()),
  loadFirebase: () => async () => defaults.store,
}));
vi.mock('../wasmBackend', () => ({ createWasmBackend: vi.fn(async () => defaults.backend) }));

function container() {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return element;
}

const page = () => ({ reload: vi.fn() });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the web start', () => {
  it("says when Firebase can't load, and tries again", async () => {
    const at = page();
    await act(() =>
      start(container(), at, {
        loadStore: () => Promise.reject(new Error('offline')),
        createBackend: vi.fn(),
      })
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Error: offline');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(at.reload).toHaveBeenCalled();
  });

  it('asks to sign in, then starts TaskMint on the cloud for whoever did', async () => {
    const store = createFakeCloudStore();
    const backend = asBackend(createFakeBackend({ capabilities: { runtime: 'web', dataLocation: 'cloud' } }));
    const createBackend = vi.fn(async () => backend);
    const at = page();
    const root = container();
    await act(() => start(root, at, { loadStore: async () => store, createBackend }));
    expect(screen.getByRole('heading', { name: 'Sign in to TaskMint' })).toBeInTheDocument();
    expect(createBackend).not.toHaveBeenCalled();

    await act(() => store.setUser(bea()));
    await vi.waitFor(() => expect(startClient).toHaveBeenCalled());
    const [into, options] = vi.mocked(startClient).mock.calls[0];
    expect(into).toBe(root);
    expect(options.backend).toBe(backend);
    expect(options.cloud).toMatchObject({ persistentCache: true, popupSignIn: true });
    expect(await options.cloudStore!()).toBe(store);
    expect(options.extensions.settingsSections!.map(section => section.id)).toEqual(['account']);
    expect(screen.queryByRole('heading', { name: 'Sign in to TaskMint' })).not.toBeInTheDocument();

    // Another sign-in event changes nothing; signing out reloads the page
    store.setUser(bea());
    expect(createBackend).toHaveBeenCalledTimes(1);
    expect(at.reload).not.toHaveBeenCalled();
    store.setUser(null);
    expect(at.reload).toHaveBeenCalled();
  });

  it("uses Firebase's SDK and the WebAssembly core by default", async () => {
    const store = createFakeCloudStore();
    store.setUser(bea());
    defaults.store = store;
    await act(() => start(container()));
    await vi.waitFor(() => expect(startClient).toHaveBeenCalled());
    expect(vi.mocked(startClient).mock.calls[0][1].backend).toBe(defaults.backend);
    expect(createWasmBackend).toHaveBeenCalledWith(expect.objectContaining({ files: expect.anything() }));
  });

  it('signs in with the store, Google in a popup', async () => {
    const store = createFakeCloudStore();
    render(<SignInPage store={store} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(store.signInWithGoogle).toHaveBeenCalledWith(null);
  });
});
