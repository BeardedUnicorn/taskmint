/**
 * Migration Dialog Component
 * 
 * Guides users through the data migration process from the old timer system
 * to the new session-based system with clear explanations and options.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  FormControlLabel,
  Checkbox,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Upgrade as UpgradeIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Backup as BackupIcon,
  Timer as TimerIcon,
  FolderOpen as SessionIcon,
} from '@mui/icons-material';
import { MigrationService, MigrationResult, MigrationOptions } from '../../../services/MigrationService';

interface MigrationDialogProps {
  open: boolean;
  onClose: () => void;
  onMigrationComplete: (result: MigrationResult) => void;
}

export function MigrationDialog({
  open,
  onClose,
  onMigrationComplete,
}: MigrationDialogProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [options, setOptions] = useState<MigrationOptions>({
    preserveOriginalData: true,
    createBackup: true,
    groupByDate: true,
    minimumDurationMs: 60000, // 1 minute
  });

  const migrationService = new MigrationService();

  const steps = [
    {
      label: 'Welcome to Session-Based Timing',
      content: 'introduction',
    },
    {
      label: 'Migration Options',
      content: 'options',
    },
    {
      label: 'Migration Process',
      content: 'migration',
    },
    {
      label: 'Complete',
      content: 'complete',
    },
  ];

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleStartMigration = async () => {
    setIsLoading(true);
    try {
      const result = await migrationService.migrateToSessions(options);
      setMigrationResult(result);
      
      if (result.success) {
        handleNext(); // Move to completion step
        onMigrationComplete(result);
      }
    } catch (error) {
      console.error('Migration failed:', error);
      setMigrationResult({
        success: false,
        migratedSessions: 0,
        migratedInstances: 0,
        migratedNotes: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptionChange = (key: keyof MigrationOptions, value: any) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const renderStepContent = (step: string) => {
    switch (step) {
      case 'introduction':
        return (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>
                Welcome to the Enhanced Time Tracker!
              </Typography>
              <Typography variant="body2">
                We've upgraded the time tracking system with powerful new features including 
                task sessions, multiple timer instances, and automatic inactivity detection.
              </Typography>
            </Alert>

            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              What's New:
            </Typography>

            <List>
              <ListItem>
                <ListItemIcon>
                  <SessionIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Task Sessions"
                  secondary="Group multiple timer instances under a single task session for better organization"
                />
              </ListItem>
              
              <ListItem>
                <ListItemIcon>
                  <TimerIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Multiple Timer Instances"
                  secondary="Run multiple timers within a session and track each work period separately"
                />
              </ListItem>
              
              <ListItem>
                <ListItemIcon>
                  <WarningIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Inactivity Detection"
                  secondary="Automatically pause timers when you're away to ensure accurate time tracking"
                />
              </ListItem>
              
              <ListItem>
                <ListItemIcon>
                  <InfoIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Enhanced Notes"
                  secondary="Add notes at task, session, or timer level for better documentation"
                />
              </ListItem>
            </List>

            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                To use these new features, we need to migrate your existing time entries 
                to the new session-based format. This process is safe and reversible.
              </Typography>
            </Alert>
          </Box>
        );

      case 'options':
        return (
          <Box>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Migration Options
            </Typography>

            <List>
              <ListItem>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={options.createBackup}
                      onChange={(e) => handleOptionChange('createBackup', e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        Create Backup
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Create a backup of your current data before migration (Recommended)
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>

              <ListItem>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={options.preserveOriginalData}
                      onChange={(e) => handleOptionChange('preserveOriginalData', e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        Preserve Original Data
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Keep your original time entries alongside the new session data
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>

              <ListItem>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={options.groupByDate}
                      onChange={(e) => handleOptionChange('groupByDate', e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        Group by Date
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Create separate sessions for the same task on different dates
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            </List>

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Recommended settings:</strong> All options enabled for the safest migration 
                that preserves your data structure and creates proper backups.
              </Typography>
            </Alert>
          </Box>
        );

      case 'migration':
        return (
          <Box>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Migration Progress
            </Typography>

            {isLoading && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Migrating your data to the new session format...
                </Typography>
                <LinearProgress />
              </Box>
            )}

            {migrationResult && (
              <Box>
                {migrationResult.success ? (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      Migration Completed Successfully!
                    </Typography>
                    <Typography variant="body2">
                      • {migrationResult.migratedSessions} sessions created
                    </Typography>
                    <Typography variant="body2">
                      • {migrationResult.migratedInstances} timer instances migrated
                    </Typography>
                    <Typography variant="body2">
                      • {migrationResult.migratedNotes} notes migrated
                    </Typography>
                  </Alert>
                ) : (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      Migration Failed
                    </Typography>
                    {migrationResult.errors.map((error, index) => (
                      <Typography key={index} variant="body2">
                        • {error}
                      </Typography>
                    ))}
                  </Alert>
                )}

                {migrationResult.warnings.length > 0 && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      Warnings
                    </Typography>
                    {migrationResult.warnings.map((warning, index) => (
                      <Typography key={index} variant="body2">
                        • {warning}
                      </Typography>
                    ))}
                  </Alert>
                )}
              </Box>
            )}

            {!isLoading && !migrationResult && (
              <Alert severity="info">
                <Typography variant="body2">
                  Ready to start migration. Click "Start Migration" to begin the process.
                </Typography>
              </Alert>
            )}
          </Box>
        );

      case 'complete':
        return (
          <Box sx={{ textAlign: 'center' }}>
            <CheckIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
              Migration Complete!
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
              Your time tracking data has been successfully migrated to the new session-based system. 
              You can now enjoy all the new features including task sessions, multiple timers, 
              and inactivity detection.
            </Typography>
            <Alert severity="success">
              <Typography variant="body2">
                You can now close this dialog and start using the enhanced time tracker!
              </Typography>
            </Alert>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={activeStep === steps.length - 1 ? onClose : undefined}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={isLoading}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <UpgradeIcon />
        Data Migration to Session-Based System
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step) => (
            <Step key={step.label}>
              <StepLabel>{step.label}</StepLabel>
              <StepContent>
                {renderStepContent(step.content)}
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        {activeStep === steps.length - 1 ? (
          <Button onClick={onClose} variant="contained" color="primary">
            Get Started
          </Button>
        ) : (
          <>
            <Button
              disabled={activeStep === 0 || isLoading}
              onClick={handleBack}
            >
              Back
            </Button>
            {activeStep === steps.length - 2 ? (
              <Button
                variant="contained"
                onClick={handleStartMigration}
                disabled={isLoading}
                startIcon={isLoading ? undefined : <BackupIcon />}
              >
                {isLoading ? 'Migrating...' : 'Start Migration'}
              </Button>
            ) : (
              <Button variant="contained" onClick={handleNext}>
                Next
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
