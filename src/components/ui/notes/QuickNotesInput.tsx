/**
 * Quick Notes Input Component
 * 
 * A simple, lightweight component for adding quick text notes
 * to timer instances without requiring templates.
 */

import React, { useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Button,
  Paper,
  Typography,
  Collapse,
  Stack,
} from '@mui/material';
import {
  Notes as NotesIcon,
  Save as SaveIcon,
  Edit as EditIcon,
} from '@mui/icons-material';

interface QuickNotesInputProps {
  value?: string;
  placeholder?: string;
  label?: string;
  onSave: (notes: string) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  multiline?: boolean;
  maxLength?: number;
}

export function QuickNotesInput({
  value = '',
  placeholder = 'Add a quick note...',
  label = 'Notes',
  onSave,
  onCancel,
  disabled = false,
  multiline = true,
  maxLength = 500,
}: QuickNotesInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    setIsEditing(true);
    setNotes(value);
  };

  const handleSave = async () => {
    if (notes.trim() === value.trim()) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(notes.trim());
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save notes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(value);
    setIsEditing(false);
    onCancel?.();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !multiline) {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
      handleCancel();
    }
  };

  // Display mode - show existing notes or add button
  if (!isEditing) {
    return (
      <Box sx={{ width: '100%' }}>
        {value ? (
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              cursor: disabled ? 'default' : 'pointer',
              '&:hover': disabled ? {} : {
                bgcolor: 'action.hover',
              },
            }}
            onClick={disabled ? undefined : handleStartEdit}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <NotesIcon sx={{ fontSize: 16, color: 'text.secondary', mt: 0.25 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {value}
                </Typography>
              </Box>
              {!disabled && (
                <IconButton size="small" sx={{ opacity: 0.7 }}>
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          </Paper>
        ) : (
          <Button
            variant="outlined"
            startIcon={<NotesIcon />}
            onClick={handleStartEdit}
            disabled={disabled}
            sx={{
              justifyContent: 'flex-start',
              color: 'text.secondary',
              borderColor: 'divider',
              '&:hover': {
                borderColor: 'primary.main',
                color: 'primary.main',
              },
            }}
            fullWidth
          >
            {placeholder}
          </Button>
        )}
      </Box>
    );
  }

  // Edit mode - show input field
  return (
    <Box sx={{ width: '100%' }}>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
          {label}
        </Typography>
        
        <TextField
          fullWidth
          multiline={multiline}
          rows={multiline ? 3 : 1}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isSaving}
          inputProps={{ maxLength }}
          helperText={`${notes.length}/${maxLength} characters`}
          autoFocus
          variant="outlined"
          size="small"
        />
        
        <Stack direction="row" spacing={1} sx={{ mt: 1, justifyContent: 'flex-end' }}>
          <Button
            size="small"
            onClick={handleCancel}
            disabled={isSaving}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={isSaving || notes.length > maxLength}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

/**
 * Compact Quick Notes Input
 * 
 * A more compact version for use in tight spaces like timer cards.
 */
interface CompactQuickNotesProps {
  value?: string;
  onSave: (notes: string) => Promise<void>;
  disabled?: boolean;
}

export function CompactQuickNotes({
  value = '',
  onSave,
  disabled = false,
}: CompactQuickNotesProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = async (notes: string) => {
    await onSave(notes);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <Box>
      <IconButton
        size="small"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        sx={{
          color: value ? 'primary.main' : 'text.secondary',
        }}
      >
        <NotesIcon fontSize="small" />
      </IconButton>
      
      <Collapse in={isOpen}>
        <Box sx={{ mt: 1, minWidth: 200 }}>
          <QuickNotesInput
            value={value}
            placeholder="Quick note..."
            label="Timer Note"
            onSave={handleSave}
            onCancel={handleCancel}
            disabled={disabled}
            multiline={false}
            maxLength={100}
          />
        </Box>
      </Collapse>
    </Box>
  );
}
