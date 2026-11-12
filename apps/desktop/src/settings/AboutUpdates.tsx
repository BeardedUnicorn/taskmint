import { useEffect } from 'react';
import { Button, Stack } from '@mui/material';
import { updates, useUpdates } from '../updates';
import { Status } from './UpdatesSection';

/**
 * About's line on updates: what the last check found, and Check for
 * updates. A request from outside (the menu bar's Check for Updates…)
 * checks as it comes; an update found opens the update dialog over About.
 */
export function AboutUpdates({ checkRequest }: { checkRequest: number }) {
  const { update } = useUpdates();
  const busy = update.status === 'checking' || update.status === 'installing';

  useEffect(() => {
    if (checkRequest > 0) void updates.check({ manual: true });
  }, [checkRequest]);

  return (
    <Stack spacing={1} sx={{ alignItems: 'center' }}>
      <Status update={update} />
      <Button size="small" variant="outlined" onClick={() => void updates.check({ manual: true })} disabled={busy}>
        Check for updates
      </Button>
    </Stack>
  );
}
