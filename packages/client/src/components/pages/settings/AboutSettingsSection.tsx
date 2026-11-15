import { useId, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  ButtonBase,
  Collapse,
  Pagination,
  Typography,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, Info as InfoIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { APP_VERSION, compareVersions } from '../../../utils/appVersion';
import {
  groupReleasesByMajor,
  type MajorReleases,
  RELEASES,
  type ReleaseNotes as Release,
  summarizeRelease,
} from '../../../utils/changelog';
import { ReleaseNotes, ReleaseNotesList } from '../../ui/display/ReleaseNotes';
import { releasesSinceUpdate, UPDATED_FROM_VERSION_KEY } from '../../../hooks/useUpdatedNotice';
import { readLocal } from '../../../utils/localStore';
import { formatLocalDate } from '../../../utils/dateHelpers';
import { useOptionalAbout } from '../../about/About';
import { useCompactLayout } from '../../../hooks/useCompactLayout';
import { useOpenedFromLink } from './settingsLink';
import { PHONE } from '../../../theme/media';

const releasedOn = (release: Release) => (release.date ? `Released ${formatLocalDate(release.date)}` : null);

/** How many of a major version's releases show at once. */
const RELEASES_PER_PAGE = 5;

/** "Oct 23, 2026 – Nov 14, 2026": when a major version's releases came out. */
function releasedBetween(releases: Release[]): string | null {
  const dates = releases.flatMap(release => (release.date ? [release.date] : [])).sort();
  if (dates.length === 0) return null;
  const [first, last] = [dates[0], dates[dates.length - 1]];
  return first === last ? formatLocalDate(first) : `${formatLocalDate(first)} – ${formatLocalDate(last)}`;
}

/** One major version's releases: folded under a heading, a page at a time. */
function MajorVersion({ group, defaultOpen }: { group: MajorReleases; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(1);
  const id = useId();
  const { major, releases } = group;
  const pages = Math.ceil(releases.length / RELEASES_PER_PAGE);
  const shown = releases.slice((page - 1) * RELEASES_PER_PAGE, page * RELEASES_PER_PAGE);
  const summary = [`${releases.length} ${releases.length === 1 ? 'release' : 'releases'}`, releasedBetween(releases)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}>
      <ButtonBase
        id={`${id}-heading`}
        aria-expanded={open}
        aria-controls={`${id}-releases`}
        onClick={() => setOpen(prev => !prev)}
        sx={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: 2,
          py: 1.5,
          textAlign: 'left',
          borderRadius: 1,
        }}
      >
        <Box>
          <Typography variant="subtitle2" component="span" sx={{ display: 'block' }}>
            Version {major}
          </Typography>
          <Typography variant="body2" component="span" color="text.secondary" sx={{ display: 'block' }}>
            {summary}
          </Typography>
        </Box>
        <ExpandMoreIcon
          color="action"
          sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        />
      </ButtonBase>
      {/* Rendered once opened, so the whole history isn't on the page */}
      <Collapse in={open} unmountOnExit>
        <Box id={`${id}-releases`} role="group" aria-labelledby={`${id}-heading`} sx={{ px: 1, pb: 1 }}>
          {shown.map(release => (
            <Accordion
              key={release.version}
              disableGutters
              variant="outlined"
              slotProps={{ transition: { unmountOnExit: true } }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                id={`release-${release.version}`}
                aria-controls={`release-${release.version}-notes`}
                sx={{ '& .MuiAccordionSummary-content': { flexWrap: 'wrap', alignItems: 'baseline' } }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, mr: 2 }}>
                  {release.version}
                </Typography>
                {release.date && (
                  <Typography variant="body2" color="text.secondary">
                    {formatLocalDate(release.date)}
                  </Typography>
                )}
                {/* How much it changed: at the row's end, or on a phone under the version */}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 'auto', pl: 2, mr: 1, [PHONE]: { flexBasis: '100%', ml: 0, pl: 0 } }}
                >
                  {summarizeRelease(release)}
                </Typography>
              </AccordionSummary>
              <AccordionDetails id={`release-${release.version}-notes`}>
                <ReleaseNotes release={release} />
              </AccordionDetails>
            </Accordion>
          ))}
          {pages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
              <Pagination
                size="small"
                color="primary"
                count={pages}
                page={page}
                onChange={(_, next) => setPage(next)}
                aria-label={`Version ${major} releases, by page`}
              />
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * The app's version, and the release notes for it and the versions before
 * it. On a phone, where About is a screen of its own, this version's notes
 * fold away like the earlier ones, unless a "What's new" link opened it.
 * The earlier releases fold under their major versions, the newest open.
 * After an update that skipped releases, "what's new" is every release
 * since the version before (useUpdatedNotice notes which that was).
 */
export function AboutSettingsSection() {
  const current = RELEASES.find(release => release.version === APP_VERSION);
  const earlier = RELEASES.filter(release => compareVersions(release.version, APP_VERSION) < 0);
  const about = useOptionalAbout();
  const compact = useCompactLayout();
  const fromLink = useOpenedFromLink();
  const from = readLocal<unknown>(UPDATED_FROM_VERSION_KEY, null);
  const since = releasesSinceUpdate(from);
  const several = since.length > 1;
  const whatsNew = several ? `What's new since ${from}` : `What's new in ${APP_VERSION}`;
  const notes = several ? (
    <ReleaseNotesList releases={since} />
  ) : current ? (
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
              {whatsNew}
            </Typography>
          </AccordionSummary>
          <AccordionDetails id="release-current-notes">{notes}</AccordionDetails>
        </Accordion>
      ) : (
        <>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            {whatsNew}
          </Typography>
          {notes}
        </>
      )}

      {earlier.length > 0 && (
        <>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
            Earlier releases
          </Typography>
          {groupReleasesByMajor(earlier).map((group, index) => (
            <MajorVersion key={group.major} group={group} defaultOpen={index === 0} />
          ))}
        </>
      )}
    </SettingsSection>
  );
}
