import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { CAPTURE } from '@taskmint/contracts';
import manifest from '../../manifest.json';

it("keeps the ID the desktop app accepts captures from", () => {
  // Chrome's ID: the key's SHA-256, its first 32 hex digits spelled a–p
  const digest = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex');
  const id = [...digest.slice(0, 32)].map(digit => String.fromCharCode(97 + parseInt(digit, 16))).join('');
  expect(`chrome-extension://${id}`).toBe(CAPTURE.EXTENSION_ORIGIN);
});

it('loads the scripts and page the build writes', () => {
  expect(manifest.background.service_worker).toBe('background.js');
  expect(manifest.content_scripts.map(script => script.js)).toEqual([['interceptor.js'], ['content.js']]);
  expect(manifest.content_scripts[0].world).toBe('MAIN');
  expect(manifest.options_ui.page).toBe('options.html');
});

it('may reach the desktop app, and a server only once allowed', () => {
  expect(manifest.host_permissions).toEqual([`http://127.0.0.1:${CAPTURE.SERVER_PORT}/*`]);
  expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://*/*']);
  expect(manifest.permissions).toEqual(['storage', 'alarms']);
});
