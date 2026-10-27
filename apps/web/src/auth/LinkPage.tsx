import { useEffect, useState, type ReactNode } from 'react';
import { Alert, CircularProgress, Stack } from '@mui/material';
import { AuthLayout } from './AuthLayout';
import { problem } from '../server';

/**
 * A page for a one-time link: it looks the link up first, then shows its
 * form, or why the link can't be used.
 */
export function LinkPage<T>({
  title,
  lookUp,
  children,
}: {
  title: string;
  lookUp: () => Promise<T>;
  children: (info: T) => ReactNode;
}) {
  const [state, setState] = useState<{ info: T } | { error: string } | null>(null);

  useEffect(() => {
    lookUp().then(
      info => setState({ info }),
      error => setState({ error: problem(error) })
    );
    // Looked up once, when the page opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthLayout title={title}>
      {state === null ? (
        <Stack sx={{ alignItems: 'center', py: 2 }}>
          <CircularProgress aria-label="Checking the link" />
        </Stack>
      ) : 'error' in state ? (
        <Alert severity="error">{state.error} Ask your TaskMint admin for a new link.</Alert>
      ) : (
        children(state.info)
      )}
    </AuthLayout>
  );
}
