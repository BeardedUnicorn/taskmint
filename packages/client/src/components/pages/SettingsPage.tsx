/**
 * Settings: one scrolling page of sections, with a list of them alongside
 * that jumps to each and follows where you are. Opening Settings for a
 * section (a toast's "Backup settings") scrolls to it. The shell's own
 * sections (AppExtensions) follow the built-in ones, and About comes last.
 *
 * A phone, with no room beside the sections, lists them instead, and each
 * opens on its own screen with a way back to the list (Android's back too).
 */

import { ComponentType, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, List, ListItemButton, ListItemText, Paper } from '@mui/material';
import { ArrowBack as BackIcon, ChevronRight } from '@mui/icons-material';
import {
  AppearanceSettingsSection,
  BackupSettingsSection,
  DailyGoalSettings,
  DataManagementSection,
  PrivacySettingsSection,
} from './settings';
import { AboutSettingsSection } from './settings/AboutSettingsSection';
import { InactivitySettingsSection } from './settings/InactivitySettingsSection';
import { NotificationSettingsSection } from './settings/NotificationSettingsSection';
import { PayoutSettingsSection } from './settings/PayoutSettingsSection';
import { CloudSyncSection } from './settings/CloudSyncSection';
import { PageContainer, PageHeader } from '../layout/PageLayout';
import { useNavigation } from '../../contexts/NavigationContext';
import { SETTINGS_SECTION_LABELS, SettingsSectionId, availableSettingsSections } from '../../navigation/views';
import { useAppExtensions } from '../../app/extensions';
import { getBackend } from '../../backend';
import { syncsThisDevice } from '../../cloud';
import { useCompactLayout } from '../../hooks/useCompactLayout';
import { useBackStep } from '../../navigation/backButton';
import { SettingsLinkContext } from './settings/settingsLink';

const SECTION_COMPONENTS: Record<SettingsSectionId, ComponentType> = {
  appearance: AppearanceSettingsSection,
  payouts: PayoutSettingsSection,
  idle: InactivitySettingsSection,
  goal: DailyGoalSettings,
  notifications: NotificationSettingsSection,
  backups: BackupSettingsSection,
  data: DataManagementSection,
  sync: CloudSyncSection,
  privacy: PrivacySettingsSection,
  about: AboutSettingsSection,
};

export const SETTINGS_SECTIONS = (Object.keys(SETTINGS_SECTION_LABELS) as SettingsSectionId[]).map(id => ({
  id,
  label: SETTINGS_SECTION_LABELS[id],
  Section: SECTION_COMPONENTS[id],
}));

const sectionElement = (id: string) => document.getElementById(`settings-${id}`);

/** A section is "current" once its top is this close to the top of the window. */
const CURRENT_LINE_PX = 120;
/** After a click in the list, scrolling there doesn't move the highlight. */
const CLICK_HOLD_MS = 1000;

/** The section you're reading: the last one whose top has reached the line (the last one at the bottom). */
export function currentSection(tops: number[], atBottom: boolean): number {
  if (atBottom) return tops.length - 1;
  let current = 0;
  tops.forEach((top, index) => {
    if (top <= CURRENT_LINE_PX) current = index;
  });
  return current;
}

const NO_EXTENSION_SECTIONS: never[] = [];

interface ListedSection {
  id: string;
  label: string;
  Section: ComponentType;
}

/** This platform's sections, in Settings' order: the built-in ones, the shell's, then About. */
function useSections(): ListedSection[] {
  const { settingsSections = NO_EXTENSION_SECTIONS } = useAppExtensions();
  return useMemo(() => {
    const available = availableSettingsSections(getBackend().platform, syncsThisDevice());
    const builtIn = SETTINGS_SECTIONS.filter(({ id }) => available.includes(id));
    return [
      ...builtIn.filter(({ id }) => id !== 'about'),
      ...settingsSections,
      ...builtIn.filter(({ id }) => id === 'about'),
    ];
  }, [settingsSections]);
}

const SUBTITLE = {
  withIdle: "Appearance, payouts, idle detection, your daily goal, notifications, backups, data and what's new",
  withoutIdle: "Appearance, payouts, your daily goal, notifications, data and what's new",
};

/** A phone's Settings: the list of sections, or the one picked from it. */
function PhoneSettings({ sections }: { sections: ListedSection[] }) {
  // The section showing, and whether a link opened it
  const [open, setOpen] = useState<{ section: ListedSection; linked: boolean } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // Opened for a section: show it (a link may name one this platform doesn't have)
  const { params, clearParams } = useNavigation();
  const linkedSection = params.section;
  useEffect(() => {
    if (!linkedSection) return;
    const section = sections.find(({ id }) => id === linkedSection);
    if (section) setOpen({ section, linked: true });
    clearParams();
  }, [linkedSection, clearParams, sections]);

  // Back to the list, Android's back included
  const close = () => setOpen(null);
  useBackStep(open !== null, close);

  // Each screen starts at its top
  useLayoutEffect(() => {
    top.current!.scrollIntoView({ block: 'start' });
  }, [open]);

  return (
    <PageContainer>
      <div ref={top} />
      <PageHeader title="Settings" subtitle={SUBTITLE.withoutIdle} />
      {open ? (
        <>
          <Button startIcon={<BackIcon />} onClick={close} sx={{ mb: 1, ml: -1 }}>
            Settings
          </Button>
          <SettingsLinkContext.Provider value={open.linked}>
            <open.section.Section />
          </SettingsLinkContext.Provider>
        </>
      ) : (
        <Paper component="nav" aria-label="Settings sections">
          <List disablePadding>
            {sections.map((section, index) => (
              <ListItemButton
                key={section.id}
                divider={index < sections.length - 1}
                onClick={() => setOpen({ section, linked: false })}
                sx={{ minHeight: 56 }}
              >
                <ListItemText primary={section.label} slotProps={{ primary: { sx: { fontWeight: 500 } } }} />
                <ChevronRight sx={{ color: 'text.secondary' }} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </PageContainer>
  );
}

export function SettingsPage() {
  const sections = useSections();
  const compact = useCompactLayout();
  return compact ? <PhoneSettings sections={sections} /> : <WideSettings sections={sections} />;
}

/** Settings beside a list of its sections, on one scrolling page. */
function WideSettings({ sections }: { sections: ListedSection[] }) {
  const [active, setActive] = useState<string>('appearance');
  const clickedAtRef = useRef(0);

  const goTo = useCallback((id: string) => {
    clickedAtRef.current = Date.now();
    setActive(id);
    // (A link may name a section this platform doesn't have)
    sectionElement(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Opened for a section: scroll to it
  const { params, clearParams } = useNavigation();
  const section = params.section;
  useEffect(() => {
    if (!section) return;
    goTo(section);
    clearParams();
  }, [section, clearParams, goTo]);

  // The list follows the section you're reading (the page scrolls inside
  // the app's content area, so this listens to scrolls anywhere)
  useEffect(() => {
    let frame = 0;
    const onScroll = (event: Event) => {
      if (Date.now() - clickedAtRef.current < CLICK_HOLD_MS) return;
      const scroller = event.target instanceof Element ? event.target : document.scrollingElement;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // (Every listed section is rendered below, with its anchor)
        const tops = sections.map(({ id }) => sectionElement(id)!.getBoundingClientRect().top);
        const atBottom = !!scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        setActive(sections[currentSection(tops, atBottom)].id);
      });
    };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      cancelAnimationFrame(frame);
    };
  }, [sections]);

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        subtitle={sections.some(({ id }) => id === 'idle') ? SUBTITLE.withIdle : SUBTITLE.withoutIdle}
      />
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        <Box
          component="nav"
          aria-label="Settings sections"
          sx={{ display: { xs: 'none', md: 'block' }, width: 200, flexShrink: 0, position: 'sticky', top: 24 }}
        >
          <List dense disablePadding>
            {sections.map(({ id, label }) => (
              <ListItemButton
                key={id}
                selected={active === id}
                aria-current={active === id ? 'location' : undefined}
                onClick={() => goTo(id)}
                sx={{ borderRadius: 1, minHeight: 36 }}
              >
                <ListItemText primary={label} />
              </ListItemButton>
            ))}
          </List>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {sections.map(({ id, Section }) => (
            <Box key={id} id={`settings-${id}`} sx={{ scrollMarginTop: 24 }}>
              <Section />
            </Box>
          ))}
        </Box>
      </Box>
    </PageContainer>
  );
}
