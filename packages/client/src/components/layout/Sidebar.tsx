import { ReactNode } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { viewShortcut } from '../../hooks/useKeyboardShortcuts';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  HomeOutlined as HomeIcon,
  Task as TaskIcon,
  Notes as NotesIcon,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  CalendarToday as CalendarIcon,
  PlayCircleOutlined as SessionsIcon,
  AttachMoney as PayoutsIcon,
} from '@mui/icons-material';

import { VIEWS, VIEW_LABELS, type SidebarView } from '../../navigation/views';
import { HOVER, SAFE_BOTTOM } from '../../theme/media';
import { Wordmark } from '../ui/display/Wordmark';

export type { SidebarView };

interface SidebarProps {
  activeView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  /** Pinned to the bottom of the sidebar (e.g. today's goal progress). */
  footer?: (collapsed: boolean) => ReactNode;
  /** Beside the title (the notifications bell); below the toggle when collapsed. */
  headerAction?: (collapsed: boolean) => ReactNode;
  /**
   * `temporary` is the phone's menu: it slides in over the page while
   * `open`, always expanded (no collapse toggle, no shortcut hints), and
   * picking a page or tapping outside it calls `onClose`.
   */
  variant?: 'permanent' | 'temporary';
  open?: boolean;
  onClose?: () => void;
}

const SIDEBAR_WIDTH = 240;
const SIDEBAR_WIDTH_COLLAPSED = 72;

/** Each page's icon (the sidebar, the phone's bottom bar). */
export const VIEW_ICONS: Record<SidebarView, typeof TaskIcon> = {
  home: HomeIcon,
  sessions: SessionsIcon,
  tasks: TaskIcon,
  notes: NotesIcon,
  history: HistoryIcon,
  calendar: CalendarIcon,
  payouts: PayoutsIcon,
  settings: SettingsIcon,
};

const navigationItems = VIEWS.map(id => ({ id, label: VIEW_LABELS[id], icon: VIEW_ICONS[id] }));

export function Sidebar({
  activeView,
  onViewChange,
  footer,
  headerAction,
  variant = 'permanent',
  open = false,
  onClose,
}: SidebarProps) {
  // Remembered across launches
  const [collapsedSetting, setIsCollapsed] = useLocalStorage('sidebarCollapsed', false);
  const temporary = variant === 'temporary';
  const isCollapsed = !temporary && collapsedSetting;

  return (
    <Drawer
      variant={variant}
      {...(temporary
        ? {
            open,
            onClose,
            // Clear of the status and navigation bars on an edge-to-edge screen
            slotProps: {
              paper: {
                sx: {
                  width: SIDEBAR_WIDTH,
                  maxWidth: 'calc(100vw - 56px)',
                  pt: 'env(safe-area-inset-top)',
                  pb: SAFE_BOTTOM,
                  backgroundColor: 'background.paper',
                },
              },
            },
          }
        : {
            sx: {
              width: isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH,
                boxSizing: 'border-box',
                backgroundColor: 'background.paper',
                borderRight: '1px solid',
                borderColor: 'divider',
                transition: theme =>
                  theme.transitions.create('width', {
                    easing: theme.transitions.easing.sharp,
                    duration: theme.transitions.duration.enteringScreen,
                  }),
              },
            },
          })}
    >
      {/* Header with Title and Toggle Button */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          flexDirection: isCollapsed ? 'column' : 'row',
          alignItems: 'center',
          gap: isCollapsed ? 1 : 0.5,
        }}
      >
        {!isCollapsed && (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Wordmark height={28} />
          </Box>
        )}
        {!isCollapsed && headerAction?.(false)}
        {!temporary && (
          <IconButton
            onClick={() => setIsCollapsed(!isCollapsed)}
            size="small"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <MenuIcon /> : <ChevronLeftIcon />}
          </IconButton>
        )}
        {isCollapsed && headerAction?.(true)}
      </Box>

      <Divider />

      <List sx={{ pt: 1 }}>
        {navigationItems.map(item => {
          const IconComponent = item.icon;
          const isSelected = activeView === item.id;

          const listItemButton = (
            <ListItemButton
              key={item.id}
              selected={isSelected}
              aria-current={isSelected ? 'page' : undefined}
              onClick={() => {
                onViewChange(item.id);
                onClose?.();
              }}
              aria-label={item.label}
              sx={{
                mx: 1,
                borderRadius: 1,
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'primary.contrastText',
                  },
                },
                [HOVER]: {
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                },
              }}
            >
              <ListItemIcon
                sx={
                  isCollapsed
                    ? {
                        minWidth: 'auto',
                        pr: 0,
                        justifyContent: 'center',
                      }
                    : {}
                }
              >
                <IconComponent />
              </ListItemIcon>
              {!isCollapsed && <ListItemText primary={item.label} />}
            </ListItemButton>
          );

          // No keyboard shortcuts to hint at on a phone
          if (temporary) return listItemButton;

          // The page's shortcut on hover; its name too when collapsed
          const shortcut = viewShortcut(item.id);
          return (
            <Tooltip
              key={item.id}
              title={isCollapsed ? `${item.label}  ${shortcut}` : shortcut}
              placement="right"
              enterDelay={isCollapsed ? 100 : 600}
              // The label already names the button; the shortcut is extra
              describeChild
            >
              {listItemButton}
            </Tooltip>
          );
        })}
      </List>

      {footer && (
        <Box
          sx={{
            mt: 'auto',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: isCollapsed ? 'center' : 'stretch',
            // Nothing to show (no goal set): no padding either
            '&:empty': { p: 0 },
          }}
        >
          {footer(isCollapsed)}
        </Box>
      )}
    </Drawer>
  );
}
