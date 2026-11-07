/**
 * Note Templates Hook
 *
 * The note templates every page shares (Notes, the Templates tab, the task
 * form, session notes), held once in NoteTemplatesProvider so a template
 * saved in one place shows everywhere.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { NoteTemplate, UseNoteTemplatesReturn } from '../types/notes';
import { NoteTemplateService } from '../services/NoteTemplateService';
import { useAsyncError } from './useAsyncError';
import { errorMessage } from '../utils/errors';
import { useAppRecordsChanged } from './useAppRecordsChanged';
import { STORAGE_KEYS } from '../constants';

export const NoteTemplatesContext = createContext<UseNoteTemplatesReturn | null>(null);

export function useNoteTemplates(): UseNoteTemplatesReturn {
  const context = useContext(NoteTemplatesContext);
  if (!context) {
    throw new Error('useNoteTemplates must be used within a NoteTemplatesProvider');
  }
  return context;
}

/** The templates state itself. Use once, in NoteTemplatesProvider. */
export function useNoteTemplatesState(): UseNoteTemplatesReturn {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  // Loading until the first load finishes ("not loaded yet" isn't "none")
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { executeAsync } = useAsyncError();
  const templateService = NoteTemplateService.getInstance();

  /**
   * Load all templates from storage
   */
  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const loadedTemplates = await templateService.getAllTemplates();
      setTemplates(loadedTemplates);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load templates'));
      console.error('Failed to load templates:', err);
    } finally {
      setIsLoading(false);
    }
  }, [templateService]);

  /**
   * Create a new template
   */
  const createTemplate = useCallback(
    async (templateData: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NoteTemplate> => {
      return executeAsync(async () => {
        setError(null);

        // Validate template name uniqueness
        const isUnique = await templateService.isTemplateNameUnique(templateData.name);
        if (!isUnique) {
          throw new Error('A template with this name already exists');
        }

        const newTemplate = await templateService.createTemplate(templateData);

        // Update local state
        setTemplates(prev => [...prev, newTemplate]);

        return newTemplate;
      });
    },
    [templateService, executeAsync]
  );

  /**
   * Update an existing template
   */
  const updateTemplate = useCallback(
    async (templateId: string, updates: Partial<NoteTemplate>): Promise<NoteTemplate> => {
      return executeAsync(async () => {
        setError(null);

        // Validate template name uniqueness if name is being updated
        if (updates.name) {
          const isUnique = await templateService.isTemplateNameUnique(updates.name, templateId);
          if (!isUnique) {
            throw new Error('A template with this name already exists');
          }
        }

        const updatedTemplate = await templateService.updateTemplate(templateId, updates);

        // Update local state
        setTemplates(prev => prev.map(template => (template.id === templateId ? updatedTemplate : template)));

        return updatedTemplate;
      });
    },
    [templateService, executeAsync]
  );

  /**
   * Delete a template
   */
  const deleteTemplate = useCallback(
    async (templateId: string): Promise<void> => {
      return executeAsync(async () => {
        setError(null);

        await templateService.deleteTemplate(templateId);

        // Update local state
        setTemplates(prev => prev.filter(template => template.id !== templateId));
      });
    },
    [templateService, executeAsync]
  );

  /**
   * Get template by ID
   */
  const getTemplateById = useCallback(
    (templateId: string): NoteTemplate | undefined => {
      return templates.find(template => template.id === templateId);
    },
    [templates]
  );

  /**
   * Get active templates only
   */
  const getActiveTemplates = useCallback((): NoteTemplate[] => {
    return templates.filter(template => template.isActive);
  }, [templates]);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Templates saved in another tab or device
  useAppRecordsChanged([STORAGE_KEYS.NOTE_TEMPLATES], () => {
    templateService.getAllTemplates().then(setTemplates, err => console.error('Failed to reload templates:', err));
  });

  return useMemo(
    () => ({
      templates,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      getTemplateById,
      getActiveTemplates,
      isLoading,
      error,
    }),
    [templates, createTemplate, updateTemplate, deleteTemplate, getTemplateById, getActiveTemplates, isLoading, error]
  );
}
