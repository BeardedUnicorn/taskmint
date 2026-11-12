/**
 * About TaskMint: a dialog in the app's own look with its version and
 * release date, the shell's update status (the desktop's Check for updates),
 * What's new, TaskMint's pages, the data and logs folders, and diagnostics
 * to paste into a problem report. Opened from the menu bar, the command
 * palette and Settings → About, through useAbout().
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material';
import {
  BugReportOutlined as ReportIcon,
  ContentCopy as CopyIcon,
  FolderOpen as FolderIcon,
  GitHub as GitHubIcon,
  NewReleasesOutlined as WhatsNewIcon,
} from '@mui/icons-material';
import type { AppFolder, AppInfo, AppLink } from '@taskmint/contracts';
import { getBackend, type Capabilities } from '../../backend';
import { useAppExtensions } from '../../app/extensions';
import { useNavigation } from '../../contexts/NavigationContext';
import { useNotification } from '../../contexts/NotificationContext';
import { syncsThisDevice, useCloudSync } from '../../cloud';
import { APP_VERSION } from '../../utils/appVersion';
import { RELEASES } from '../../utils/changelog';
import { formatLocalDate } from '../../utils/dateHelpers';
import { syncStatus } from '../layout/SyncStatusLine';

export interface AboutOptions {
  /** Check for updates as it opens (the menu bar's Check for Updates…). */
  checkForUpdates?: boolean;
}

interface AboutValue {
  openAbout(options?: AboutOptions): void;
}

const AboutContext = createContext<AboutValue | null>(null);

/** What a problem report needs, as plain lines. Never the account's email. */
export function diagnostics({
  version,
  runtime,
  info,
  sync,
  userAgent,
}: {
  version: string;
  runtime: Capabilities['runtime'];
  info: AppInfo | null;
  /** Where cloud sync stands; null where this device doesn't sync. */
  sync: string | null;
  userAgent: string;
}): string {
  return [
    `TaskMint ${version} (${runtime})`,
    info && `System: ${info.os} ${info.arch}`,
    info && `Data folder: ${info.dataDir}`,
    info?.logDir && `Logs: ${info.logDir}`,
    sync && `Cloud sync: ${sync}`,
    `User agent: ${userAgent}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function AboutDialog({ checkRequest, onClose }: { checkRequest: number; onClose: () => void }) {
  const { platform, capabilities } = getBackend();
  const { AboutUpdates } = useAppExtensions();
  const { navigate } = useNavigation();
  const { showSuccess, showError } = useNotification();
  const sync = useCloudSync();
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    platform.appInfo?.().then(setInfo, error => console.warn('Failed to read the app info:', error));
  }, [platform]);

  const release = RELEASES.find(candidate => candidate.version === APP_VERSION);
  const released = release?.date ? ` · Released ${formatLocalDate(release.date)}` : '';

  const quietly = { category: 'settings', desktop: 'never', history: false } as const;
  const run = (what: string, action: () => Promise<void>) => () => {
    action().catch(error => showError(`Couldn't ${what}: ${String(error)}`, quietly));
  };
  const openLink = (link: AppLink) => run('open the page', () => platform.openLink!(link));
  const openFolder = (folder: AppFolder) => run('open the folder', () => platform.openFolder!(folder));

  const copyDiagnostics = run('copy the diagnostics', async () => {
    const text = diagnostics({
      version: APP_VERSION,
      runtime: capabilities.runtime,
      info,
      sync: sync && syncsThisDevice() ? syncStatus(sync.view).label : null,
      userAgent: navigator.userAgent,
    });
    await navigator.clipboard.writeText(text);
    showSuccess('Copied the diagnostics. Paste them into your problem report.', quietly);
  });

  const whatsNew = () => {
    onClose();
    navigate('settings', { section: 'about' });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="about-title">
      <DialogContent sx={{ textAlign: 'center', pt: 4 }}>
        <Box component="img" src="/taskmint-icon.png" alt="" sx={{ width: 72, height: 72, mb: 1 }} />
        <Typography id="about-title" variant="h5" component="h2" sx={{ fontWeight: 600 }}>
          TaskMint
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Version {APP_VERSION}
          {released}
        </Typography>

        {AboutUpdates && (
          <Box sx={{ mt: 2 }}>
            <AboutUpdates checkRequest={checkRequest} />
          </Box>
        )}

        <Stack direction="row" sx={{ mt: 2, justifyContent: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Button size="small" startIcon={<WhatsNewIcon />} onClick={whatsNew}>
            What's new
          </Button>
          {platform.openLink && (
            <>
              <Button size="small" startIcon={<GitHubIcon />} onClick={openLink('repository')}>
                TaskMint on GitHub
              </Button>
              <Button size="small" startIcon={<ReportIcon />} onClick={openLink('issues')}>
                Report a problem
              </Button>
            </>
          )}
        </Stack>
        {platform.openFolder && (
          <Stack direction="row" sx={{ mt: 1, justifyContent: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" startIcon={<FolderIcon />} onClick={openFolder('data')}>
              Show data folder
            </Button>
            <Button size="small" startIcon={<FolderIcon />} onClick={openFolder('logs')}>
              Show logs folder
            </Button>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button startIcon={<CopyIcon />} onClick={copyDiagnostics} sx={{ mr: 'auto' }}>
          Copy diagnostics
        </Button>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Holds the About dialog for whatever opens it. */
export function AboutProvider({ children }: { children: ReactNode }) {
  // null: closed. The count goes up with each request to check for updates.
  const [shown, setShown] = useState<{ checkRequest: number } | null>(null);
  const openAbout = useCallback((options: AboutOptions = {}) => {
    setShown(previous => {
      const count = previous?.checkRequest ?? 0;
      return { checkRequest: options.checkForUpdates ? count + 1 : count };
    });
  }, []);
  const close = useCallback(() => setShown(null), []);
  const value = useMemo(() => ({ openAbout }), [openAbout]);

  return (
    <AboutContext.Provider value={value}>
      {children}
      {shown && <AboutDialog checkRequest={shown.checkRequest} onClose={close} />}
    </AboutContext.Provider>
  );
}

export function useAbout(): AboutValue {
  const about = useContext(AboutContext);
  if (!about) {
    throw new Error('useAbout must be used within an AboutProvider');
  }
  return about;
}

/** The About dialog when the app has one (a Settings section rendered on its own in a test has none). */
export function useOptionalAbout(): AboutValue | null {
  return useContext(AboutContext);
}
