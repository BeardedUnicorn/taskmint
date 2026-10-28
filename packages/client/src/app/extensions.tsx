/**
 * What a shell adds to the client: Settings sections of its own (the web
 * app's account and admin sections, the desktop's server connection). The
 * shell passes only the ones its platform supports.
 */

import { ComponentType, createContext, useContext } from 'react';

export interface SettingsSectionExtension {
  /** Unique among Settings' sections; the section's element id is `settings-<id>`. */
  id: string;
  label: string;
  Section: ComponentType;
}

export interface AppExtensions {
  /** Shown after the built-in sections, in this order. */
  settingsSections?: readonly SettingsSectionExtension[];
  /**
   * Shown under "Try again" when the data can't be opened at startup (the
   * desktop's way back to the data on the computer when its server can't be
   * used). It renders outside the app's theme and notifications.
   */
  StartupErrorActions?: ComponentType;
}

const AppExtensionsContext = createContext<AppExtensions>({});

export const AppExtensionsProvider = AppExtensionsContext.Provider;

export function useAppExtensions(): AppExtensions {
  return useContext(AppExtensionsContext);
}
