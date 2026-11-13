import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Typography } from '@mui/material';
import { ExpandMore as ExpandMoreIcon, Info as InfoIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { APP_VERSION, compareVersions } from '../../../utils/appVersion';
import { RELEASES, type ReleaseNotes as Release } from '../../../utils/changelog';
import { ReleaseNotes } from '../../ui/display/ReleaseNotes';
import { formatLocalDate } from '../../../utils/dateHelpers';
import { useOptionalAbout } from '../../about/About';
import { useCompactLayout } from '../../../hooks/useCompactLayout';
import { useOpenedFromLink } from './settingsLink';

const releasedOn = (release: Release) => (release.date ? `Released ${formatLocalDate(release.date)}` : null);

/**
 * The app's version, and the release notes for it and the versions before
 * it. On a phone, where About is a screen of its own, this version's notes
 * fold away like the earlier ones, unless a "What's new" link opened it.
 */
export function AboutSettingsSection() {
  const current = RELEASES.find(release => release.version === APP_VERSION);
  const earlier = RELEASES.filter(release => compareVersions(release.version, APP_VERSION) < 0);
  const about = useOptionalAbout();
  const compact = useCompactLayout();
  const fromLink = useOpenedFromLink();
  const notes = current ? (
    <ReleaseNotes release={current} />
  ) : (
    <Typography variant="body2" color="text.secondary">
      There are no release notes for this version.
    </Typography>
  );

  return (
    <SettingsSection
      title="About"
      icon={<InfoIcon color="primary" />}
      headerChildren={
        about && (
          <Button size="small" onClick={() => about.openAbout()} sx={{ ml: 'auto' }}>
            About TaskMint…
          </Button>
        )
      }
    >
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

      {compact ? (
        <Accordion disableGutters variant="outlined" defaultExpanded={fromLink} sx={{ mt: 3 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} id="release-current" aria-controls="release-current-notes">
            <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
              What's new in {APP_VERSION}
            </Typography>
          </AccordionSummary>
          <AccordionDetails id="release-current-notes">{notes}</AccordionDetails>
        </Accordion>
      ) : (
        <>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            What's new in {APP_VERSION}
          </Typography>
          {notes}
        </>
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
