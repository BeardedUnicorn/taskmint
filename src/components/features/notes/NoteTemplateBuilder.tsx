/**
 * Note Template Builder Component
 * 
 * Split-pane interface for managing note templates with template list on the left
 * and template builder/editor on the right.
 */

import { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  IconButton,
  Button,
  TextField,
  Stack,

  Chip,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,

  Delete as DeleteIcon,

  Visibility as ActiveIcon,
  VisibilityOff as InactiveIcon,
} from '@mui/icons-material';
import { NoteTemplateBuilderProps, NoteTemplate, TemplateField } from '../../../types/notes';
import { FieldEditor } from './FieldEditor';
import { ConfirmDialog } from '../../ui';

export function NoteTemplateBuilder({
  templates,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onSelectTemplate,
  selectedTemplate,
}: NoteTemplateBuilderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const showSnackbar = useCallback((message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const handleSelectTemplate = useCallback((template: NoteTemplate | null) => {
    onSelectTemplate(template);
    if (template) {
      setTemplateName(template.name);
      setTemplateDescription(template.description || '');
      setTemplateFields([...template.fields]);
      setIsEditing(false);
    } else {
      // New template
      setTemplateName('');
      setTemplateDescription('');
      setTemplateFields([]);
      setIsEditing(true);
    }
  }, [onSelectTemplate]);

  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim()) {
      showSnackbar('Template name is required', 'error');
      return;
    }

    try {
      const templateData = {
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        fields: templateFields,
        isActive: true,
      };

      if (selectedTemplate) {
        // Update existing template
        await onUpdateTemplate(selectedTemplate.id, templateData);
        showSnackbar('Template updated successfully');
      } else {
        // Create new template
        const newTemplate = await onCreateTemplate(templateData);
        handleSelectTemplate(newTemplate);
        showSnackbar('Template created successfully');
      }
      
      setIsEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save template';
      showSnackbar(message, 'error');
    }
  }, [
    templateName,
    templateDescription,
    templateFields,
    selectedTemplate,
    onUpdateTemplate,
    onCreateTemplate,
    handleSelectTemplate,
    showSnackbar,
  ]);

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    try {
      await onDeleteTemplate(templateId);
      if (selectedTemplate?.id === templateId) {
        handleSelectTemplate(null);
      }
      showSnackbar('Template deleted successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template';
      showSnackbar(message, 'error');
    }
    setDeleteConfirm(null);
  }, [onDeleteTemplate, selectedTemplate, handleSelectTemplate, showSnackbar]);

  const handleToggleActive = useCallback(async (template: NoteTemplate) => {
    try {
      await onUpdateTemplate(template.id, { isActive: !template.isActive });
      showSnackbar(`Template ${template.isActive ? 'deactivated' : 'activated'} successfully`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update template';
      showSnackbar(message, 'error');
    }
  }, [onUpdateTemplate, showSnackbar]);

  const handleAddField = useCallback(() => {
    const newField: TemplateField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      label: 'New Field',
      type: 'text',
      required: false,
      order: templateFields.length,
    };
    setTemplateFields(prev => [...prev, newField]);
    setIsEditing(true);
  }, [templateFields.length]);

  const handleUpdateField = useCallback((updatedField: TemplateField) => {
    setTemplateFields(prev => 
      prev.map(field => field.id === updatedField.id ? updatedField : field)
    );
    setIsEditing(true);
  }, []);

  const handleDeleteField = useCallback((fieldId: string) => {
    setTemplateFields(prev => {
      const filtered = prev.filter(field => field.id !== fieldId);
      // Reorder remaining fields
      return filtered.map((field, index) => ({ ...field, order: index }));
    });
    setIsEditing(true);
  }, []);

  const handleMoveField = useCallback((fieldId: string, direction: 'up' | 'down') => {
    setTemplateFields(prev => {
      const currentIndex = prev.findIndex(field => field.id === fieldId);
      if (currentIndex === -1) return prev;

      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const newFields = [...prev];
      [newFields[currentIndex], newFields[newIndex]] = [newFields[newIndex], newFields[currentIndex]];
      
      // Update order values
      return newFields.map((field, index) => ({ ...field, order: index }));
    });
    setIsEditing(true);
  }, []);

  return (
    <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
      {/* Left Panel - Template List */}
      <Paper sx={{ width: 300, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" gutterBottom>
            Note Templates
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            fullWidth
            onClick={() => handleSelectTemplate(null)}
          >
            New Template
          </Button>
        </Box>
        
        <List sx={{ flex: 1, overflow: 'auto' }}>
          {templates.length === 0 ? (
            <ListItem>
              <ListItemText
                primary="No templates yet"
                secondary="Create your first template to get started"
              />
            </ListItem>
          ) : (
            templates.map((template) => (
              <ListItem key={template.id} disablePadding>
                <ListItemButton
                  selected={selectedTemplate?.id === template.id}
                  onClick={() => handleSelectTemplate(template)}
                  sx={{ pr: 1 }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2">
                          {template.name}
                        </Typography>
                        <Chip
                          size="small"
                          label={template.fields.length}
                          color="primary"
                          variant="outlined"
                        />
                        {!template.isActive && (
                          <Chip
                            size="small"
                            label="Inactive"
                            color="default"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    secondary={template.description || 'No description'}
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActive(template);
                      }}
                      title={template.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {template.isActive ? <ActiveIcon /> : <InactiveIcon />}
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(template.id);
                      }}
                      color="error"
                      title="Delete"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>
      </Paper>

      {/* Right Panel - Template Builder */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedTemplate || isEditing ? (
          <>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Stack spacing={2}>
                <TextField
                  label="Template Name"
                  value={templateName}
                  onChange={(e) => {
                    setTemplateName(e.target.value);
                    setIsEditing(true);
                  }}
                  fullWidth
                  required
                />
                <TextField
                  label="Description"
                  value={templateDescription}
                  onChange={(e) => {
                    setTemplateDescription(e.target.value);
                    setIsEditing(true);
                  }}
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Optional description for this template"
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim()}
                  >
                    {selectedTemplate ? 'Update Template' : 'Create Template'}
                  </Button>
                  {isEditing && (
                    <Button
                      variant="outlined"
                      onClick={() => {
                        if (selectedTemplate) {
                          handleSelectTemplate(selectedTemplate);
                        } else {
                          handleSelectTemplate(null);
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </Box>
              </Stack>
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Template Fields
              </Typography>
              
              {templateFields.length === 0 ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  No fields added yet. Click "Add Field" to create your first field.
                </Alert>
              ) : (
                <Stack spacing={2} sx={{ mb: 2 }}>
                  {templateFields
                    .sort((a, b) => a.order - b.order)
                    .map((field, index) => (
                      <FieldEditor
                        key={field.id}
                        field={field}
                        onUpdateField={handleUpdateField}
                        onDeleteField={handleDeleteField}
                        onMoveField={handleMoveField}
                        isFirst={index === 0}
                        isLast={index === templateFields.length - 1}
                      />
                    ))}
                </Stack>
              )}

              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddField}
                fullWidth
              >
                Add Field
              </Button>
            </Box>
          </>
        ) : (
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            p: 4,
            textAlign: 'center',
          }}>
            <Stack spacing={2}>
              <Typography variant="h5" color="text.secondary">
                Select a Template
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Choose a template from the list to edit it, or create a new template to get started.
              </Typography>
            </Stack>
          </Box>
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteTemplate(deleteConfirm)}
        title="Delete Template"
        message="Are you sure you want to delete this template? This action cannot be undone and will affect any existing notes using this template."
        confirmLabel="Delete"
        severity="error"
      />

      {/* Snackbar for notifications */}
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
