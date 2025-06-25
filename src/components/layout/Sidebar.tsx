
import { useState } from 'react';
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
  Dashboard as DashboardIcon,
  Task as TaskIcon,
  AccessTime as TimeEntriesIcon,
  BarChart as BarChartIcon,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material';

export type SidebarView = 'dashboard' | 'tasks' | 'time-entries' | 'reports' | 'settings';

interface SidebarProps {
  activeView: SidebarView;
  onViewChange: (view: SidebarView) => void;
}

const SIDEBAR_WIDTH = 240;
const SIDEBAR_WIDTH_COLLAPSED = 72;

const navigationItems = [
  {
    id: 'dashboard' as SidebarView,
    label: 'Dashboard',
    icon: DashboardIcon,
  },
  {
    id: 'tasks' as SidebarView,
    label: 'Tasks',
    icon: TaskIcon,
  },
  {
    id: 'time-entries' as SidebarView,
    label: 'Time Entries',
    icon: TimeEntriesIcon,
  },
  {
    id: 'reports' as SidebarView,
    label: 'Reports',
    icon: BarChartIcon,
  },
  {
    id: 'settings' as SidebarView,
    label: 'Settings',
    icon: SettingsIcon,
  },
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
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
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'space-between'
      }}>
        {!isCollapsed && (
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            TaskMint
          </Typography>
        )}
        <IconButton
          onClick={() => setIsCollapsed(!isCollapsed)}
          size="small"
          sx={{
            ml: isCollapsed ? 0 : 1,
          }}
        >
          {isCollapsed ? <MenuIcon /> : <ChevronLeftIcon />}
        </IconButton>
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
    </Drawer>
  );
}
