/**
 * Note Template Service
 * 
 * This service handles all operations related to note templates including
 * CRUD operations, validation, and template management.
 */

import { NoteTemplate, TemplateField, NoteTemplateSchema } from '../types/notes';
import { StorageService } from './StorageService';
import { validateWithSchema } from '../utils/validation';

export class NoteTemplateService {
  private static instance: NoteTemplateService;
  private storageService: StorageService;
  private templateCache = new Map<string, NoteTemplate>();

  constructor() {
    this.storageService = StorageService.getInstance();
  }

  static getInstance(): NoteTemplateService {
    if (!NoteTemplateService.instance) {
      NoteTemplateService.instance = new NoteTemplateService();
    }
    return NoteTemplateService.instance;
  }

  /**
   * Get all note templates
   */
  async getAllTemplates(): Promise<NoteTemplate[]> {
    try {
      const templates = await this.storageService.getNoteTemplates();

      // Ensure default free-form template exists
      if (!templates.some(t => t.id === 'free-form')) {
        const now = new Date().toISOString();
        const freeFormTemplate: NoteTemplate = {
          id: 'free-form',
          name: 'Free-form Note',
          description: 'Default template for free-form notes',
          fields: [],
          createdAt: now,
          updatedAt: now,
          isActive: false,
        };
        templates.push(freeFormTemplate);
        await this.storageService.setNoteTemplates(templates);
      }

      // Update cache
      this.templateCache.clear();
      templates.forEach(template => {
        this.templateCache.set(template.id, template);
      });

      return templates;
    } catch (error) {
      console.error('Failed to get note templates:', error);
      throw new Error('Failed to load note templates');
    }
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId: string): Promise<NoteTemplate | null> {
    try {
      // Check cache first
      if (this.templateCache.has(templateId)) {
        return this.templateCache.get(templateId)!;
      }

      // Load from storage
      const templates = await this.getAllTemplates();
      return templates.find(template => template.id === templateId) || null;
    } catch (error) {
      console.error(`Failed to get template ${templateId}:`, error);
      return null;
    }
  }

  /**
   * Create a new note template
   */
  async createTemplate(templateData: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NoteTemplate> {
    try {
      // Validate template data
      const now = new Date().toISOString();
      const newTemplate: NoteTemplate = {
        ...templateData,
        id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: now,
        updatedAt: now,
      };

      // Validate with schema
      const validationResult = validateWithSchema(NoteTemplateSchema, newTemplate);
      if (!validationResult.success) {
        throw new Error(`Template validation failed: ${validationResult.error}`);
      }

      // Ensure field order is correct
      newTemplate.fields = this.normalizeFieldOrder(newTemplate.fields);

      // Save to storage
      const templates = await this.getAllTemplates();
      templates.push(newTemplate);
      await this.storageService.setNoteTemplates(templates);

      // Update cache
      this.templateCache.set(newTemplate.id, newTemplate);
      return newTemplate;
    } catch (error) {
      console.error('Failed to create template:', error);
      throw new Error('Failed to create note template');
    }
  }

  /**
   * Update an existing note template
   */
  async updateTemplate(templateId: string, updates: Partial<NoteTemplate>): Promise<NoteTemplate> {
    try {
      const templates = await this.getAllTemplates();
      const templateIndex = templates.findIndex(template => template.id === templateId);

      if (templateIndex === -1) {
        throw new Error(`Template with ID ${templateId} not found`);
      }

      // Apply updates
      const updatedTemplate: NoteTemplate = {
        ...templates[templateIndex],
        ...updates,
        id: templateId, // Ensure ID doesn't change
        updatedAt: new Date().toISOString(),
      };

      // Normalize field order if fields were updated
      if (updates.fields) {
        updatedTemplate.fields = this.normalizeFieldOrder(updatedTemplate.fields);
      }

      // Validate updated template
      const validationResult = validateWithSchema(NoteTemplateSchema, updatedTemplate);
      if (!validationResult.success) {
        throw new Error(`Template validation failed: ${validationResult.error}`);
      }

      // Update in storage
      templates[templateIndex] = updatedTemplate;
      await this.storageService.setNoteTemplates(templates);

      // Update cache
      this.templateCache.set(templateId, updatedTemplate);
      return updatedTemplate;
    } catch (error) {
      console.error(`Failed to update template ${templateId}:`, error);
      throw new Error('Failed to update note template');
    }
  }

  /**
   * Delete a note template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    try {
      const templates = await this.getAllTemplates();
      const filteredTemplates = templates.filter(template => template.id !== templateId);

      if (filteredTemplates.length === templates.length) {
        throw new Error(`Template with ID ${templateId} not found`);
      }

      // Save updated list
      await this.storageService.setNoteTemplates(filteredTemplates);

      // Remove from cache
      this.templateCache.delete(templateId);

    } catch (error) {
      console.error(`Failed to delete template ${templateId}:`, error);
      throw new Error('Failed to delete note template');
    }
  }

  /**
   * Get active templates only
   */
  async getActiveTemplates(): Promise<NoteTemplate[]> {
    const templates = await this.getAllTemplates();
    return templates.filter(template => template.isActive);
  }

  /**
   * Duplicate a template
   */
  async duplicateTemplate(templateId: string, newName?: string): Promise<NoteTemplate> {
    try {
      const originalTemplate = await this.getTemplateById(templateId);
      if (!originalTemplate) {
        throw new Error(`Template with ID ${templateId} not found`);
      }

      const duplicatedTemplate = {
        ...originalTemplate,
        name: newName || `${originalTemplate.name} (Copy)`,
        fields: originalTemplate.fields.map(field => ({
          ...field,
          id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        })),
      };

      // Remove id, createdAt, updatedAt to let createTemplate generate new ones
      const { id, createdAt, updatedAt, ...templateData } = duplicatedTemplate;
      
      return await this.createTemplate(templateData);
    } catch (error) {
      console.error(`Failed to duplicate template ${templateId}:`, error);
      throw new Error('Failed to duplicate note template');
    }
  }

  /**
   * Normalize field order to ensure sequential ordering
   */
  private normalizeFieldOrder(fields: TemplateField[]): TemplateField[] {
    return fields
      .sort((a, b) => a.order - b.order)
      .map((field, index) => ({
        ...field,
        order: index,
      }));
  }

  /**
   * Generate a unique field ID
   */
  generateFieldId(): string {
    return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate template name uniqueness
   */
  async isTemplateNameUnique(name: string, excludeId?: string): Promise<boolean> {
    const templates = await this.getAllTemplates();
    return !templates.some(template => 
      template.name.toLowerCase() === name.toLowerCase() && 
      template.id !== excludeId
    );
  }

  /**
   * Get template statistics
   */
  async getTemplateStats(): Promise<{ totalTemplates: number; activeTemplates: number }> {
    const templates = await this.getAllTemplates();
    return {
      totalTemplates: templates.length,
      activeTemplates: templates.filter(template => template.isActive).length,
    };
  }
}
