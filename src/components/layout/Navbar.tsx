import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Tabs,
  Tab,
  Box,
} from '@mui/material';
import { Stop, AccessTime, Task, Description } from '@mui/icons-material';
import { TimeEntry } from '../../types/timer';

interface NavbarProps {
  activeEntry: TimeEntry | null;
  onStopActiveTimer: () => void;
  currentTab: number;
  onTabChange: (event: React.SyntheticEvent, newValue: number) => void;
}

export function Navbar({ 
  activeEntry, 
  onStopActiveTimer, 
  currentTab, 
  onTabChange 
}: NavbarProps) {
  return (
    <AppBar position="static" elevation={0}>
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Time Tracker
        </Typography>
        
        {/* Navigation Tabs */}
        <Box sx={{ mr: 3 }}>
          <Tabs 
            value={currentTab} 
            onChange={onTabChange}
            textColor="inherit"
            indicatorColor="secondary"
            sx={{
              '& .MuiTab-root': {
                color: 'rgba(255, 255, 255, 0.7)',
                '&.Mui-selected': {
                  color: 'white',
                },
              },
            }}
          >
            <Tab
              icon={<AccessTime />}
              label="Daily Time Entries"
              iconPosition="start"
              sx={{ minHeight: 48 }}
            />
            <Tab
              icon={<Task />}
              label="Task Management"
              iconPosition="start"
              sx={{ minHeight: 48 }}
            />
            <Tab
              icon={<Description />}
              label="Note Templates"
              iconPosition="start"
              sx={{ minHeight: 48 }}
            />
          </Tabs>
        </Box>

        {/* Stop Timer Button */}
        {activeEntry && (
          <Button
            color="inherit"
            onClick={onStopActiveTimer}
            startIcon={<Stop />}
            variant="outlined"
            size="small"
          >
            Stop Timer
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
}
