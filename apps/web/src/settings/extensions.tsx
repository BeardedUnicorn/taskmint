import { Button } from '@mui/material';
import type { AppExtensions } from '@taskmint/client/start';
import { getCloudSync } from '@taskmint/client/cloud';
import { AccountSection } from './AccountSection';

/** When the data can't be opened: signing out, to sign in again. */
function SignOut() {
  return <Button onClick={() => void getCloudSync()?.signOut()}>Sign out</Button>;
}

/** The web app's own parts: Settings → Account, and signing out when the data can't be opened. */
export function webExtensions(): AppExtensions {
  return {
    settingsSections: [{ id: 'account', label: 'Account', Section: AccountSection }],
    StartupErrorActions: SignOut,
  };
}
