// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeFake, type ChromeFake } from './chromeFake';
import page from '../../options.html?raw';
const SERVER = { kind: 'server', url: 'https://taskmint.example.com', token: 'tmk_capture' } as const;

let chrome: ChromeFake;
const fetchMock = vi.fn<typeof fetch>();

/** The options page as Chrome opens it, with `saved` in storage. */
async function open(saved?: Record<string, unknown>) {
  chrome = installChromeFake();
  Object.assign(chrome.storage.local.data, saved);
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(page)![1];
  vi.resetModules();
  const { ready } = await import('../options');
  await ready;
}

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const status = () => document.getElementById('status')!;
const choose = (kind: 'desktop' | 'server') => {
  const radio = document.querySelector<HTMLInputElement>(`input[value="${kind}"]`)!;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
};
const type = (id: string, value: string) => (field(id).value = value);
const test = () => document.getElementById('test')!.click();
const save = () => (document.getElementById('target') as HTMLFormElement).requestSubmit();

async function says(text: string, problem: boolean) {
  await vi.waitFor(() => expect(status().textContent).toBe(text));
  expect(status().classList.contains('problem')).toBe(problem);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the options page', () => {
  it('shows the desktop app by default, and the server fields once a server is chosen', async () => {
    await open();
    expect(document.querySelector<HTMLInputElement>('input[value="desktop"]')!.checked).toBe(true);
    expect((document.getElementById('server') as HTMLFieldSetElement).disabled).toBe(true);
    choose('server');
    expect((document.getElementById('server') as HTMLFieldSetElement).disabled).toBe(false);
    expect(status().textContent).toBe('');
  });

  it('shows the saved server, and says when it refused the token', async () => {
    await open({ target: SERVER, tokenRejected: true });
    expect(document.querySelector<HTMLInputElement>('input[value="server"]')!.checked).toBe(true);
    expect([field('url').value, field('token').value]).toEqual([SERVER.url, SERVER.token]);
    await says('The server refused the token: set a new one, then save.', true);
  });

  it('tests a server: the permission to reach it, then the token', async () => {
    await open();
    choose('server');
    type('url', 'https://taskmint.example.com/');
    type('token', ' tmk_capture ');
    fetchMock.mockResolvedValueOnce(Response.json({ app: 'TaskMint', version: '1.0.0', username: 'bea' }));
    test();
    await says("It works: captures go to bea's account on TaskMint 1.0.0.", false);
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://taskmint.example.com/*'] });
    expect(fetchMock).toHaveBeenCalledWith('https://taskmint.example.com/api/v1/capture/ping', {
      headers: { Authorization: 'Bearer tmk_capture', 'X-TaskMint-Capture': '1' },
    });

    fetchMock.mockResolvedValueOnce(Response.json({ error: 'sign in first' }, { status: 401 }));
    test();
    await says('The server refused the token: sign in first.', true);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    test();
    await says("Can't reach https://taskmint.example.com: Failed to fetch.", true);
    fetchMock.mockRejectedValueOnce('offline');
    test();
    await says("Can't reach https://taskmint.example.com: offline.", true);
  });

  it("doesn't test or save what can't be used", async () => {
    await open();
    choose('server');
    type('url', 'taskmint.example.com');
    test();
    await says('The address starts with http:// or https://, like https://taskmint.example.com.', true);
    type('url', 'http://taskmint.example.com');
    test();
    await says('http:// would send the token unencrypted. Use https://, or http:// only for this computer (localhost).', true);
    type('url', 'https://taskmint.example.com');
    save();
    await says('Paste a token from the web app (Settings → API tokens).', true);

    type('token', 'tmk_capture');
    chrome.permissions.request.mockResolvedValue(false);
    save();
    await says("TaskMint can't reach https://taskmint.example.com without that permission.", true);
    test();
    await says("TaskMint can't reach https://taskmint.example.com without that permission.", true);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves a server, asking for permission to reach it', async () => {
    await open();
    choose('server');
    type('url', 'http://localhost:8080');
    type('token', 'tmk_capture');
    save();
    await says('Saved: captures go to http://localhost:8080.', false);
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['http://localhost:8080/*'] });
    expect(chrome.storage.local.data.target).toEqual({ kind: 'server', url: 'http://localhost:8080', token: 'tmk_capture' });
    expect(chrome.permissions.remove).not.toHaveBeenCalled();
  });

  it('gives up the permission for a server it no longer uses', async () => {
    await open({ target: SERVER });
    type('token', 'tmk_new');
    save();
    await says(`Saved: captures go to ${SERVER.url}.`, false);
    expect(chrome.permissions.remove).not.toHaveBeenCalled();

    type('url', 'https://other.example.com');
    save();
    await says('Saved: captures go to https://other.example.com.', false);
    expect(chrome.permissions.remove).toHaveBeenCalledWith({ origins: [`${SERVER.url}/*`] });

    choose('desktop');
    save();
    await says('Saved: captures go to the TaskMint app on this computer.', false);
    expect(chrome.storage.local.data.target).toEqual({ kind: 'desktop' });
    expect(chrome.permissions.remove).toHaveBeenLastCalledWith({ origins: ['https://other.example.com/*'] });
  });
});
