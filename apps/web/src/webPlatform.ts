/**
 * The browser as the client's platform: exports are downloads, an import is
 * a file picked in the browser's dialog, and notifications are the Web
 * Notification API's, and usage analytics are Firebase Analytics'. The
 * desktop-only features (idle detection, folder backups, reveal, the capture
 * server) are absent, so the client leaves out what needs them. Google
 * sign-in opens in a popup, Firebase's own way. TaskMint's pages open in a
 * new tab.
 */

import { CORE_ERRORS, LINKS, type AppLink } from '@taskmint/contracts';
import type { Platform } from '@taskmint/client/backend';
import { createWebAnalytics } from './analytics';

const MEDIA_TYPES = { json: 'application/json', csv: 'text/csv' } as const;

const LINK_URLS: Record<AppLink, string> = {
  repository: LINKS.REPOSITORY,
  help: LINKS.HELP,
  issues: LINKS.ISSUES,
  releases: LINKS.RELEASES,
};

/** A download's name: no folders, and ending in `.<format>`. */
export function downloadName(suggested: string, format: 'json' | 'csv'): string {
  const base = suggested.split(/[\\/]/).pop()!.trim() || 'taskmint-export';
  return base.toLowerCase().endsWith(`.${format}`) ? base : `${base}.${format}`;
}

function download(contents: string, name: string, format: 'json' | 'csv'): void {
  const url = URL.createObjectURL(new Blob([contents], { type: MEDIA_TYPES[format] }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Once the browser has started the download
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Asks for a JSON file and reads it. Null when the dialog is dismissed;
 * rejects, as the desktop does, with "Invalid JSON file: …" for one that
 * isn't JSON.
 */
function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(
        text => {
          try {
            JSON.parse(text);
          } catch (error) {
            reject(`${CORE_ERRORS.INVALID_JSON_FILE}: ${(error as Error).message}`);
            return;
          }
          resolve(text);
        },
        error => reject(`Failed to read import file: ${(error as Error).message}`)
      );
    });
    input.click();
  });
}

/** Shows a notification if the browser has (or now gets) permission. */
async function notify(title: string, body: string): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  const permission =
    Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') return false;
  new Notification(title, { body });
  return true;
}

export function createWebPlatform(): Platform {
  return {
    files: {
      async save({ contents, suggestedName, format }) {
        const name = downloadName(suggestedName, format);
        download(contents, name, format);
        return { kind: 'download', name };
      },
      openJson: pickJsonFile,
    },
    notifications: {
      show: (_kind, title, body) => notify(title, body),
    },
    analytics: createWebAnalytics(),
    async openLink(link) {
      window.open(LINK_URLS[link], '_blank', 'noopener');
    },
  };
}
