
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Divider,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Task as TaskIcon,
  BarChart as BarChartIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

export type SidebarView = 'dashboard' | 'tasks' | 'reports' | 'settings';

interface SidebarProps {
  activeView: SidebarView;
  onViewChange: (view: SidebarView) => void;
}

const SIDEBAR_WIDTH = 240;

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
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
          Time Tracker
        </Typography>
      </Box>
      
      <Divider />
      
      <List sx={{ pt: 1 }}>
        {navigationItems.map((item) => {
          const IconComponent = item.icon;
          const isSelected = activeView === item.id;
          
          return (
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
              <ListItemIcon>
                <IconComponent />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </Drawer>
  );
}
