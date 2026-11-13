import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import { VIEW_LABELS, type SidebarView } from '../../navigation/views';
import { BOTTOM_BAR_HEIGHT, SAFE_BOTTOM } from '../../theme/media';
import { VIEW_ICONS } from './Sidebar';

/** The pages a phone keeps a thumb's reach away; the top bar's menu has the rest. */
export const BOTTOM_BAR_VIEWS = ['home', 'sessions', 'calendar', 'payouts'] as const satisfies readonly SidebarView[];

const isTab = (view: SidebarView): view is (typeof BOTTOM_BAR_VIEWS)[number] =>
  (BOTTOM_BAR_VIEWS as readonly SidebarView[]).includes(view);

interface BottomNavBarProps {
  activeView: SidebarView;
  /** Also called for the tab already showing: the page goes back to its top. */
  onViewChange: (view: SidebarView) => void;
}

/** A phone's tabs along the bottom of the screen, under the page. */
export function BottomNavBar({ activeView, onViewChange }: BottomNavBarProps) {
  return (
    <Paper
      component="nav"
      aria-label="Pages"
      square
      elevation={0}
      sx={{
        flexShrink: 0,
        borderTop: 1,
        borderColor: 'divider',
        // Clear of the gesture bar on an edge-to-edge screen
        pb: SAFE_BOTTOM,
      }}
    >
      <BottomNavigation
        showLabels
        // No tab lit for a page reached from the menu (Tasks, Settings…)
        value={isTab(activeView) ? activeView : false}
        onChange={(_event, view: SidebarView) => onViewChange(view)}
        sx={{ height: BOTTOM_BAR_HEIGHT, bgcolor: 'transparent' }}
      >
        {BOTTOM_BAR_VIEWS.map(view => {
          const Icon = VIEW_ICONS[view];
          return (
            <BottomNavigationAction
              key={view}
              value={view}
              label={VIEW_LABELS[view]}
              icon={<Icon />}
              aria-current={view === activeView ? 'page' : undefined}
            />
          );
        })}
      </BottomNavigation>
    </Paper>
  );
}
