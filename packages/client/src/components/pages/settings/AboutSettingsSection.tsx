import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import { ExpandMore as ExpandMoreIcon, Info as InfoIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { APP_VERSION, compareVersions } from '../../../utils/appVersion';
import { RELEASES, type ReleaseNotes as Release } from '../../../utils/changelog';
import { ReleaseNotes } from '../../ui/display/ReleaseNotes';
import { formatLocalDate } from '../../../utils/dateHelpers';

const releasedOn = (release: Release) => (release.date ? `Released ${formatLocalDate(release.date)}` : null);

/** The app's version, and the release notes for it and the versions before it. */
export function AboutSettingsSection() {
  const current = RELEASES.find(release => release.version === APP_VERSION);
  const earlier = RELEASES.filter(release => compareVersions(release.version, APP_VERSION) < 0);

  return (
    <SettingsSection title="About" icon={<InfoIcon color="primary" />}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box component="img" src="/taskmint-icon.png" alt="" sx={{ width: 48, height: 48 }} />
        <Box>
          <Typography variant="subtitle1" component="p" sx={{ fontWeight: 600 }}>
            TaskMint {APP_VERSION}
          </Typography>
          {current && releasedOn(current) && (
            <Typography variant="body2" color="text.secondary">
              {releasedOn(current)}
            </Typography>
          )}
        </Box>
      </Box>

      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
        What's new in {APP_VERSION}
      </Typography>
      {current ? (
        <ReleaseNotes release={current} />
      ) : (
        <Typography variant="body2" color="text.secondary">
          There are no release notes for this version.
        </Typography>
      )}

      {earlier.length > 0 && (
        <>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            Earlier releases
          </Typography>
          {earlier.map(release => (
            <Accordion
              key={release.version}
              disableGutters
              variant="outlined"
              // Rendered once opened, so the whole history isn't on the page
              slotProps={{ transition: { unmountOnExit: true } }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                id={`release-${release.version}`}
                aria-controls={`release-${release.version}-notes`}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, mr: 2 }}>
                  {release.version}
                </Typography>
                {release.date && (
                  <Typography variant="body2" color="text.secondary">
                    {formatLocalDate(release.date)}
                  </Typography>
                )}
              </AccordionSummary>
              <AccordionDetails id={`release-${release.version}-notes`}>
                <ReleaseNotes release={release} />
              </AccordionDetails>
            </Accordion>
          ))}
        </>
      )}
    </SettingsSection>
  );
}
