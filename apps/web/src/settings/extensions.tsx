import type { AppExtensions } from '@taskmint/client/start';
import type { WebSession } from '../session';
import { AccountSection } from './AccountSection';
import { TokensSection } from './TokensSection';
import { UsersSection } from './UsersSection';
import { InvitesSection } from './InvitesSection';

/** The web app's own Settings sections: the account and tokens, and for admins, users and invites. */
export function webExtensions(session: WebSession): AppExtensions {
  const sections = [
    { id: 'account', label: 'Account', Section: () => <AccountSection session={session} /> },
    { id: 'tokens', label: 'API tokens', Section: () => <TokensSection session={session} /> },
  ];
  if (session.user.role === 'admin') {
    sections.push(
      { id: 'users', label: 'Users', Section: () => <UsersSection session={session} /> },
      { id: 'invites', label: 'Invites', Section: () => <InvitesSection session={session} /> }
    );
  }
  return { settingsSections: sections };
}
