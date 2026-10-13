/**
 * Note Templates Hook
 * 
 * This hook provides state management and operations for note templates
 * including CRUD operations, validation, and template management.
 */

import { useState, useEffect, useCallback } from 'react';
import { NoteTemplate, UseNoteTemplatesReturn } from '../types/notes';
import { NoteTemplateService } from '../services/NoteTemplateService';
import { useAsyncError } from './useAsyncError';

export function useNoteTemplates(): UseNoteTemplatesReturn {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
      const errorMessage = err instanceof Error ? err.message : 'Failed to load templates';
      setError(errorMessage);
      console.error('Failed to load templates:', err);
    } finally {
      setIsLoading(false);
    }
  }, [templateService]);

  /**
   * Create a new template
   */
  const createTemplate = useCallback(async (
    templateData: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NoteTemplate> => {
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
  }, [templateService, executeAsync]);

  /**
   * Update an existing template
   */
  const updateTemplate = useCallback(async (
    templateId: string, 
    updates: Partial<NoteTemplate>
  ): Promise<NoteTemplate> => {
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
      setTemplates(prev => 
        prev.map(template => 
          template.id === templateId ? updatedTemplate : template
        )
      );
      
      return updatedTemplate;
    });
  }, [templateService, executeAsync]);

  /**
   * Delete a template
   */
  const deleteTemplate = useCallback(async (templateId: string): Promise<void> => {
    return executeAsync(async () => {
      setError(null);
      
      await templateService.deleteTemplate(templateId);
      
      // Update local state
      setTemplates(prev => prev.filter(template => template.id !== templateId));
    });
  }, [templateService, executeAsync]);

  /**
   * Get template by ID
   */
  const getTemplateById = useCallback((templateId: string): NoteTemplate | undefined => {
    return templates.find(template => template.id === templateId);
  }, [templates]);

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

  return {
    templates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplateById,
    getActiveTemplates,
    isLoading,
    error,
  };
}
