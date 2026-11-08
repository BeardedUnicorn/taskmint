/**
 * The web app's start: its own pages (signing in, invite and reset links),
 * or, for a signed-in browser, the TaskMint app against the server.
 * Signing in and out reload the page, so each page load has one backend.
 */

import { createRoot } from 'react-dom/client';
import { Alert, Button, Stack } from '@mui/material';
import { AuthLayout } from './auth/AuthLayout';
import { LoginPage } from './auth/LoginPage';
import { InvitePage } from './auth/InvitePage';
import { ResetPage } from './auth/ResetPage';
import { createHttpBackend } from './httpBackend';
import { loginPath, matchRoute, type Route } from './routes';
import { createServer, problem, type ServerError } from './server';
import { webExtensions } from './settings/extensions';
import type { SessionInfo } from './types';

type Page = Pick<Location, 'pathname' | 'search' | 'assign' | 'reload'>;

function AuthPage({ route, page }: { route: Exclude<Route, { kind: 'app' }>; page: Page }) {
  const server = createServer();
  const enterApp = (path: string) => () => page.assign(path);
  switch (route.kind) {
    case 'login':
      return <LoginPage server={server} onSignedIn={enterApp(route.next)} />;
    case 'invite':
      return <InvitePage server={server} token={route.token} onSignedIn={enterApp('/')} />;
    case 'reset':
      return <ResetPage server={server} token={route.token} onSignedIn={enterApp('/')} />;
  }
}

/** The server didn't answer (or answered with an error) when the page opened. */
function Unreachable({ message, page }: { message: string; page: Page }) {
  return (
    <AuthLayout title="TaskMint can't start">
      <Stack spacing={2}>
        <Alert severity="error">{message}</Alert>
        <Button variant="contained" onClick={() => page.reload()}>
          Try again
        </Button>
      </Stack>
    </AuthLayout>
  );
}

export async function start(container: HTMLElement, page: Page = window.location): Promise<void> {
  const route = matchRoute(page.pathname, page.search);
  if (route.kind !== 'app') {
    createRoot(container).render(<AuthPage route={route} page={page} />);
    return;
  }

  const signIn = () => page.assign(loginPath(page));
  let me: SessionInfo;
  try {
    me = await createServer().request<SessionInfo>('GET', '/auth/me');
  } catch (error) {
    if ((error as ServerError).status === 401) signIn();
    else createRoot(container).render(<Unreachable message={problem(error)} page={page} />);
    return;
  }

  const server = createServer({ csrfToken: me.csrfToken ?? undefined, onUnauthorized: signIn });
  // The app's code loads only once signed in
  const { startClient } = await import('@taskmint/client/start');
  await startClient(container, {
    backend: createHttpBackend({ server }),
    extensions: webExtensions({ user: me.user, server, navigate: path => page.assign(path) }),
  });
}
