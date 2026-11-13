/**
 * The web app's start: Firebase first, then a sign-in page until someone is
 * signed in, then TaskMint, on TaskMint's rules in WebAssembly and the
 * account's data from the cloud. Signing out (or deleting the account)
 * reloads the page, so each page load has one user.
 */

import { createRoot } from 'react-dom/client';
import { Alert, Button, Stack } from '@mui/material';
import type { Backend } from '@taskmint/client/backend';
import { loadFirebase, type CloudStore } from '@taskmint/client/cloud';
import { SignInForm } from '@taskmint/client/ui';
import { AuthLayout } from './auth/AuthLayout';
import { webCloud } from './firebaseConfig';
import { webExtensions } from './settings/extensions';
import { createWasmBackend } from './wasmBackend';
import { createWebPlatform } from './webPlatform';

type Page = Pick<Location, 'reload'>;

export interface WebStart {
  /** Firebase's SDK, signed in or not. */
  loadStore(): Promise<CloudStore>;
  /** TaskMint's rules for this page. */
  createBackend(): Promise<Backend>;
}

const CLOUD = webCloud(import.meta.env);

const DEFAULTS: WebStart = {
  loadStore: loadFirebase(CLOUD),
  createBackend: () => createWasmBackend(createWebPlatform({ analytics: Boolean(CLOUD.firebase.measurementId) })),
};

export function SignInPage({ store }: { store: CloudStore }) {
  return (
    <AuthLayout title="Sign in to TaskMint">
      <SignInForm
        intro="Your sessions, tasks and work logs, here and on your other devices."
        engine={{
          signIn: store.signIn,
          signUp: store.signUp,
          resetPassword: store.resetPassword,
          signInWithGoogle: () => store.signInWithGoogle(null),
          canUseGoogle: true,
        }}
      />
    </AuthLayout>
  );
}

/** Firebase couldn't load when the page opened. */
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

export async function start(container: HTMLElement, page: Page = window.location, web: WebStart = DEFAULTS) {
  const root = createRoot(container);
  let store: CloudStore;
  try {
    store = await web.loadStore();
  } catch (error) {
    root.render(<Unreachable message={String(error)} page={page} />);
    return;
  }

  let entered = false;
  store.onUser(user => {
    if (entered) {
      // Signed out, or the account deleted: back to signing in
      if (!user) page.reload();
      return;
    }
    if (!user) {
      root.render(<SignInPage store={store} />);
      return;
    }
    entered = true;
    root.unmount();
    void enter(container, store, web);
  });
}

async function enter(container: HTMLElement, store: CloudStore, web: WebStart) {
  const backend = await web.createBackend();
  // The app's code loads only once signed in
  const { startClient } = await import('@taskmint/client/start');
  await startClient(container, {
    backend,
    extensions: webExtensions(),
    cloud: CLOUD,
    cloudStore: async () => store,
  });
}
