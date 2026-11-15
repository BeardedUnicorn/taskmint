import { useEffect } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { openSecuritySettings } from './tauriBackend';
import type { AvailableUpdate } from './updates';
import { UpdateNotes } from './UpdateNotes';

/** How to turn Advanced Protection off, in the order the phone's Settings asks. */
const STEPS = [
  'Open the phone’s Settings, then Security & privacy.',
  'Tap Advanced Protection.',
  'Turn Device protection off, and restart the phone if it asks.',
  'Open TaskMint again and download the update.',
  'Once TaskMint has updated, turn Device protection back on the same way.',
];

interface AdvancedProtectionHelpProps {
  update: AvailableUpdate;
  /** Asks the phone again whether Advanced Protection is on. */
  onRecheck(): void;
  onClose(): void;
}

/**
 * What the update dialog shows on a phone with Advanced Protection on:
 * Android installs nothing from outside Google Play there, so instead of a
 * download that can't be installed, this says how to turn it off. It asks
 * the phone again when the app comes back from Settings, and the download
 * takes its place once Advanced Protection is off. The update's notes are
 * here too.
 */
export function AdvancedProtectionHelp({ update, onRecheck, onClose }: AdvancedProtectionHelpProps) {
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && onRecheck();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [onRecheck]);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="advanced-protection-title">
      <DialogTitle id="advanced-protection-title">Turn off Advanced Protection to update</DialogTitle>
      <DialogContent>
        <DialogContentText>
          TaskMint {update.version} is available, and you have {update.currentVersion}. Advanced Protection is on, and
          it blocks apps that don't come from Google Play, so Android won't install this update until it's off.
        </DialogContentText>
        <Box component="ol" aria-label="How to turn off Advanced Protection" sx={{ pl: 2.5, mt: 2, mb: 0 }}>
          {STEPS.map(step => (
            <Box component="li" key={step} sx={{ mb: 1 }}>
              {step}
            </Box>
          ))}
        </Box>
        {/* What the update is worth the trouble for */}
        <UpdateNotes update={update} />
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button onClick={onClose}>Close</Button>
        <Button onClick={onRecheck}>Check again</Button>
        <Button variant="contained" onClick={openSecuritySettings}>
          Open Settings
        </Button>
      </DialogActions>
    </Dialog>
  );
}
