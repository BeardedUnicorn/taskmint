/**
 * Settings: one scrolling page of sections, with a list of them alongside
 * that jumps to each and follows where you are. Opening Settings for a
 * section (a toast's "Backup settings") scrolls to it. The shell's own
 * sections (AppExtensions) follow the built-in ones.
 */

import { ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, List, ListItemButton, ListItemText } from '@mui/material';
import {
  AppearanceSettingsSection,
  BackupSettingsSection,
  DailyGoalSettings,
  DataManagementSection,
  PrivacySettingsSection,
} from './settings';
import { InactivitySettingsSection } from './settings/InactivitySettingsSection';
import { NotificationSettingsSection } from './settings/NotificationSettingsSection';
import { PayoutSettingsSection } from './settings/PayoutSettingsSection';
import { PageContainer, PageHeader } from '../layout/PageLayout';
import { useOptionalNavigation } from '../../contexts/NavigationContext';
import { SETTINGS_SECTION_LABELS, SettingsSectionId, availableSettingsSections } from '../../navigation/views';
import { useAppExtensions } from '../../app/extensions';
import { getBackend } from '../../backend';

const SECTION_COMPONENTS: Record<SettingsSectionId, ComponentType> = {
  appearance: AppearanceSettingsSection,
  payouts: PayoutSettingsSection,
  idle: InactivitySettingsSection,
  goal: DailyGoalSettings,
  notifications: NotificationSettingsSection,
  backups: BackupSettingsSection,
  data: DataManagementSection,
  privacy: PrivacySettingsSection,
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

export function SettingsPage() {
  const { settingsSections = NO_EXTENSION_SECTIONS } = useAppExtensions();
  const sections = useMemo(() => {
    const available = availableSettingsSections(getBackend().platform);
    return [...SETTINGS_SECTIONS.filter(({ id }) => available.includes(id)), ...settingsSections];
  }, [settingsSections]);
  const [active, setActive] = useState<string>('appearance');
  const clickedAtRef = useRef(0);

  const goTo = useCallback((id: string) => {
    clickedAtRef.current = Date.now();
    setActive(id);
    sectionElement(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);

  // Opened for a section: scroll to it
  const navigation = useOptionalNavigation();
  const section = navigation?.params.section;
  useEffect(() => {
    if (!section) return;
    goTo(section);
    navigation?.clearParams();
  }, [section, navigation, goTo]);

  // The list follows the section you're reading (the page scrolls inside
  // the app's content area, so this listens to scrolls anywhere)
  useEffect(() => {
    let frame = 0;
    const onScroll = (event: Event) => {
      if (Date.now() - clickedAtRef.current < CLICK_HOLD_MS) return;
      const scroller = event.target instanceof Element ? event.target : document.scrollingElement;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const tops = sections.map(({ id }) => sectionElement(id)?.getBoundingClientRect().top ?? Infinity);
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
        subtitle={
          sections.some(({ id }) => id === 'idle')
            ? 'Appearance, payouts, idle detection, your daily goal, notifications, backups and data'
            : 'Appearance, payouts, your daily goal, notifications and data'
        }
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
