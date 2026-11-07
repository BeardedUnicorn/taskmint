/**
 * Note Templates Page
 *
 * Main page component for the Note Templates feature, providing the interface
 * for managing note templates with split-pane layout and template builder.
 */

import { useState, useCallback } from 'react';
import { Box, Typography, Alert, CircularProgress } from '@mui/material';
import { NoteTemplate } from '../../types/notes';
import { NoteTemplateBuilder } from '../features/notes/NoteTemplateBuilder';
import { useNoteTemplates } from '../../hooks/useNoteTemplates';

export function NoteTemplates() {
  // By id, so the selection is always the template as saved now
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The builder reports what each action did (one toast per action)
  const { templates, createTemplate, updateTemplate, deleteTemplate, isLoading, error } = useNoteTemplates();

  const selectedTemplate = templates.find(template => template.id === selectedId) ?? null;
  const handleSelectTemplate = useCallback((template: NoteTemplate | null) => {
    setSelectedId(template?.id ?? null);
  }, []);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', pt: 3 }}>
      {/* Page Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          Note Templates
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Create and manage templates for structured task notes. Templates define the fields and validation rules for
          capturing consistent information across your tasks.
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
          onCreateTemplate={createTemplate}
          onUpdateTemplate={updateTemplate}
          onDeleteTemplate={deleteTemplate}
          onSelectTemplate={handleSelectTemplate}
          selectedTemplate={selectedTemplate}
        />
      </Box>
    </Box>
  );
}
