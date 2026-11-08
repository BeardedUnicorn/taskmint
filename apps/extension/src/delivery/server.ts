// Delivery to a TaskMint server: the capture endpoint with the account's
// token (a "Browser extension" token from the web app). The server has no
// CORS: the extension reaches it through the host permission the options
// page asked for.

import { CAPTURE } from '@taskmint/contracts';

/** The server refused the token (revoked, or the account disabled): retrying won't help. */
export class TokenRejected extends Error {}

type Server = { url: string; token: string };

function request(server: Server, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${server.url}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${server.token}`,
      [CAPTURE.HEADER]: '1',
      ...init.headers,
    },
  });
}

/** The server's reason for an error reply (`{ error, code }`), else its status. */
async function reason(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === 'string' ? body.error : `the server responded ${response.status}`;
}

async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  const why = await reason(response);
  if (response.status === 401 || response.status === 403) throw new TokenRejected(why);
  throw new Error(why);
}

export async function deliverToServer(server: Server, payloadText: string): Promise<void> {
  await checked(
    await request(server, '/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadText,
    })
  );
}

/** The options page's Test: who the token signs in as, on which version. */
export async function pingServer(server: Server): Promise<{ version: string; username: string }> {
  const response = await checked(await request(server, '/capture/ping'));
  return (await response.json()) as { version: string; username: string };
}
