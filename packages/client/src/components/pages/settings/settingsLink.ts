import { createContext, useContext } from 'react';

/**
 * Whether the Settings section showing was opened by a link to it (a
 * toast's "What's new", the About dialog), rather than picked from a
 * phone's list of sections. About opens its release notes for a link.
 */
export const SettingsLinkContext = createContext(false);

export const useOpenedFromLink = () => useContext(SettingsLinkContext);
