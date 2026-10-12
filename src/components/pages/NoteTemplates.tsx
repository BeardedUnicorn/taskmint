/**
 * Note Templates Page
 * 
 * Main page component for the Note Templates feature, providing the interface
 * for managing note templates with split-pane layout and template builder.
 */

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Alert,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import { NoteTemplate } from '../../types/notes';
import { NoteTemplateBuilder } from '../features/notes/NoteTemplateBuilder';
import { useNoteTemplates } from '../../hooks/useNoteTemplates';

export function NoteTemplates() {
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const {
    templates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    isLoading,
    error,
  } = useNoteTemplates();

  const showSnackbar = useCallback((
    message: string, 
    severity: 'success' | 'error' | 'info' = 'success'
  ) => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const handleCreateTemplate = useCallback(async (
    templateData: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NoteTemplate> => {
    try {
      const newTemplate = await createTemplate(templateData);
      showSnackbar('Template created successfully');
      return newTemplate;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create template';
      showSnackbar(message, 'error');
      throw error;
    }
  }, [createTemplate, showSnackbar]);

  const handleUpdateTemplate = useCallback(async (
    templateId: string,
    updates: Partial<NoteTemplate>
  ): Promise<NoteTemplate> => {
    try {
      const updatedTemplate = await updateTemplate(templateId, updates);
      showSnackbar('Template updated successfully');
      return updatedTemplate;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update template';
      showSnackbar(message, 'error');
      throw error;
    }
  }, [updateTemplate, showSnackbar]);

  const handleDeleteTemplate = useCallback(async (templateId: string): Promise<void> => {
    try {
      await deleteTemplate(templateId);
      showSnackbar('Template deleted successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template';
      showSnackbar(message, 'error');
      throw error;
    }
  }, [deleteTemplate, showSnackbar]);

  const handleSelectTemplate = useCallback((template: NoteTemplate | null) => {
    setSelectedTemplate(template);
  }, []);

  if (isLoading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px' 
      }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3 }}>
      {/* Page Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Note Templates
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Create and manage templates for structured task notes. Templates define the fields
          and validation rules for capturing consistent information across your tasks.
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Main Content */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <NoteTemplateBuilder
          templates={templates}
          onCreateTemplate={handleCreateTemplate}
          onUpdateTemplate={handleUpdateTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onSelectTemplate={handleSelectTemplate}
          selectedTemplate={selectedTemplate}
        />
      </Box>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
