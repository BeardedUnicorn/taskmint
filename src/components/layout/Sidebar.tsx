
import { useState, ReactNode } from 'react';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
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

export type { SidebarView };

interface SidebarProps {
  activeView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  /** Pinned to the bottom of the sidebar (e.g. today's goal progress). */
  footer?: (collapsed: boolean) => ReactNode;
  /** Beside the title (the notifications bell); below the toggle when collapsed. */
  headerAction?: (collapsed: boolean) => ReactNode;
}

const SIDEBAR_WIDTH = 240;
const SIDEBAR_WIDTH_COLLAPSED = 72;

const VIEW_ICONS: Record<SidebarView, typeof TaskIcon> = {
  sessions: SessionsIcon,
  tasks: TaskIcon,
  notes: NotesIcon,
  history: HistoryIcon,
  calendar: CalendarIcon,
  payouts: PayoutsIcon,
  settings: SettingsIcon,
};

const navigationItems = VIEWS.map(id => ({ id, label: VIEW_LABELS[id], icon: VIEW_ICONS[id] }));

export function Sidebar({ activeView, onViewChange, footer, headerAction }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          transition: (theme) => theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        },
      }}
    >
      {/* Header with Title and Toggle Button */}
      <Box sx={{
        p: 2,
        display: 'flex',
        flexDirection: isCollapsed ? 'column' : 'row',
        alignItems: 'center',
        gap: isCollapsed ? 1 : 0.5,
      }}>
        {!isCollapsed && (
          <Typography variant="h6" component="div" sx={{ fontWeight: 600, flex: 1 }}>
            TaskMint
          </Typography>
        )}
        {!isCollapsed && headerAction?.(false)}
        <IconButton
          onClick={() => setIsCollapsed(!isCollapsed)}
          size="small"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <MenuIcon /> : <ChevronLeftIcon />}
        </IconButton>
        {isCollapsed && headerAction?.(true)}
      </Box>

      <Divider />

      <List sx={{ pt: 1 }}>
        {navigationItems.map((item) => {
          const IconComponent = item.icon;
          const isSelected = activeView === item.id;

          const listItemButton = (
            <ListItemButton
              key={item.id}
              selected={isSelected}
              onClick={() => onViewChange(item.id)}
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
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <ListItemIcon
                sx={isCollapsed ? {
                  minWidth: 'auto',
                  pr: 0,
                  justifyContent: 'center'
                } : {}}
              >
                <IconComponent />
              </ListItemIcon>
              {!isCollapsed && <ListItemText primary={item.label} />}
            </ListItemButton>
          );

          // Wrap with tooltip when collapsed
          return isCollapsed ? (
            <Tooltip key={item.id} title={item.label} placement="right">
              {listItemButton}
            </Tooltip>
          ) : (
            listItemButton
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
