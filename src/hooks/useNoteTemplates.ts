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
   * Duplicate a template
   */
  const duplicateTemplate = useCallback(async (
    templateId: string, 
    newName?: string
  ): Promise<NoteTemplate> => {
    return executeAsync(async () => {
      setError(null);
      
      const duplicatedTemplate = await templateService.duplicateTemplate(templateId, newName);
      
      // Update local state
      setTemplates(prev => [...prev, duplicatedTemplate]);
      
      return duplicatedTemplate;
    });
  }, [templateService, executeAsync]);

  /**
   * Toggle template active status
   */
  const toggleTemplateActive = useCallback(async (templateId: string): Promise<NoteTemplate> => {
    const template = getTemplateById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    return updateTemplate(templateId, { isActive: !template.isActive });
  }, [getTemplateById, updateTemplate]);

  /**
   * Get active templates only
   */
  const getActiveTemplates = useCallback((): NoteTemplate[] => {
    return templates.filter(template => template.isActive);
  }, [templates]);

  /**
   * Get template statistics
   */
  const getTemplateStats = useCallback(() => {
    return {
      totalTemplates: templates.length,
      activeTemplates: templates.filter(template => template.isActive).length,
      inactiveTemplates: templates.filter(template => !template.isActive).length,
    };
  }, [templates]);

  /**
   * Search templates by name
   */
  const searchTemplates = useCallback((query: string): NoteTemplate[] => {
    if (!query.trim()) return templates;
    
    const lowercaseQuery = query.toLowerCase();
    return templates.filter(template => 
      template.name.toLowerCase().includes(lowercaseQuery) ||
      template.description?.toLowerCase().includes(lowercaseQuery)
    );
  }, [templates]);

  /**
   * Sort templates by various criteria
   */
  const sortTemplates = useCallback((
    sortBy: 'name' | 'createdAt' | 'updatedAt' | 'fieldCount',
    order: 'asc' | 'desc' = 'asc'
  ): NoteTemplate[] => {
    const sorted = [...templates].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'fieldCount':
          comparison = a.fields.length - b.fields.length;
          break;
      }
      
      return order === 'desc' ? -comparison : comparison;
    });
    
    return sorted;
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
    isLoading,
    error,
    // Additional utility methods
    duplicateTemplate,
    toggleTemplateActive,
    getActiveTemplates,
    getTemplateStats,
    searchTemplates,
    sortTemplates,
    refreshTemplates: loadTemplates,
  } as UseNoteTemplatesReturn & {
    duplicateTemplate: (templateId: string, newName?: string) => Promise<NoteTemplate>;
    toggleTemplateActive: (templateId: string) => Promise<NoteTemplate>;
    getActiveTemplates: () => NoteTemplate[];
    getTemplateStats: () => { totalTemplates: number; activeTemplates: number; inactiveTemplates: number };
    searchTemplates: (query: string) => NoteTemplate[];
    sortTemplates: (sortBy: 'name' | 'createdAt' | 'updatedAt' | 'fieldCount', order?: 'asc' | 'desc') => NoteTemplate[];
    refreshTemplates: () => Promise<void>;
  };
}
