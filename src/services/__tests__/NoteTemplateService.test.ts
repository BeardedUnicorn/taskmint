/**
 * Tests for NoteTemplateService
 */

import { NoteTemplateService } from '../NoteTemplateService';
import { StorageService } from '../StorageService';
import { NoteTemplate, TemplateField, NoteTemplateSchema } from '../../types/notes';
import { validateWithSchema } from '../../utils/validation';

// Mock dependencies
jest.mock('../StorageService');
jest.mock('../../utils/validation');

describe('NoteTemplateService', () => {
  let noteTemplateService: NoteTemplateService;
  let mockStorageService: jest.Mocked<StorageService>;
  let mockValidateWithSchema: jest.MockedFunction<typeof validateWithSchema>;

  const mockTemplate: NoteTemplate = {
    id: 'template_1',
    name: 'Test Template',
    description: 'A test template',
    fields: [
      {
        id: 'field_1',
        label: 'Text Field',
        type: 'text',
        required: true,
        order: 0,
        placeholder: 'Enter text',
      },
      {
        id: 'field_2',
        label: 'Number Field',
        type: 'number',
        required: false,
        order: 1,
        validation: { min: 0, max: 100 },
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    isActive: true,
  };

  beforeEach(() => {
    // Reset singleton instance
    (NoteTemplateService as any).instance = undefined;
    noteTemplateService = NoteTemplateService.getInstance();
    
    // Setup mocks
    mockStorageService = {
      getNoteTemplates: jest.fn(),
      setNoteTemplates: jest.fn(),
    } as any;
    
    (StorageService.getInstance as jest.Mock).mockReturnValue(mockStorageService);
    
    mockValidateWithSchema = validateWithSchema as jest.MockedFunction<typeof validateWithSchema>;
    mockValidateWithSchema.mockReturnValue({ success: true, data: mockTemplate });
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = NoteTemplateService.getInstance();
      const instance2 = NoteTemplateService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getAllTemplates', () => {
    it('should return all templates and update cache', async () => {
      const templates = [mockTemplate];
      mockStorageService.getNoteTemplates.mockResolvedValue(templates);
      
      const result = await noteTemplateService.getAllTemplates();
      
      expect(result).toEqual(templates);
      expect(mockStorageService.getNoteTemplates).toHaveBeenCalled();
      
      // Verify cache is updated
      const cachedTemplate = await noteTemplateService.getTemplateById('template_1');
      expect(cachedTemplate).toEqual(mockTemplate);
    });

    it('should handle storage errors', async () => {
      mockStorageService.getNoteTemplates.mockRejectedValue(new Error('Storage error'));
      
      await expect(noteTemplateService.getAllTemplates())
        .rejects.toThrow('Failed to load note templates');
    });
  });

  describe('getTemplateById', () => {
    it('should return template from cache if available', async () => {
      // First load templates to populate cache
      mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
      await noteTemplateService.getAllTemplates();
      
      // Clear mock calls
      mockStorageService.getNoteTemplates.mockClear();
      
      const result = await noteTemplateService.getTemplateById('template_1');
      
      expect(result).toEqual(mockTemplate);
      expect(mockStorageService.getNoteTemplates).not.toHaveBeenCalled();
    });

    it('should load from storage if not in cache', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
      
      const result = await noteTemplateService.getTemplateById('template_1');
      
      expect(result).toEqual(mockTemplate);
      expect(mockStorageService.getNoteTemplates).toHaveBeenCalled();
    });

    it('should return null if template not found', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([]);
      
      const result = await noteTemplateService.getTemplateById('nonexistent');
      
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockStorageService.getNoteTemplates.mockRejectedValue(new Error('Storage error'));
      
      const result = await noteTemplateService.getTemplateById('template_1');
      
      expect(result).toBeNull();
    });
  });

  describe('createTemplate', () => {
    const templateData = {
      name: 'New Template',
      description: 'A new template',
      fields: [
        {
          id: 'field_1',
          label: 'Test Field',
          type: 'text' as const,
          required: true,
          order: 0,
        },
      ],
      isActive: true,
    };

    it('should create a new template successfully', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([]);
      mockStorageService.setNoteTemplates.mockResolvedValue();
      
      const result = await noteTemplateService.createTemplate(templateData);
      
      expect(result).toMatchObject({
        name: templateData.name,
        description: templateData.description,
        isActive: templateData.isActive,
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.fields[0].order).toBe(0);
      
      expect(mockValidateWithSchema).toHaveBeenCalledWith(NoteTemplateSchema, result);
      expect(mockStorageService.setNoteTemplates).toHaveBeenCalled();
    });

    it('should normalize field order', async () => {
      const templateWithUnorderedFields = {
        ...templateData,
        fields: [
          { id: 'field_1', label: 'Field 1', type: 'text' as const, required: true, order: 5 },
          { id: 'field_2', label: 'Field 2', type: 'text' as const, required: false, order: 2 },
          { id: 'field_3', label: 'Field 3', type: 'text' as const, required: false, order: 8 },
        ],
      };
      
      mockStorageService.getNoteTemplates.mockResolvedValue([]);
      mockStorageService.setNoteTemplates.mockResolvedValue();
      
      const result = await noteTemplateService.createTemplate(templateWithUnorderedFields);
      
      expect(result.fields[0].order).toBe(0);
      expect(result.fields[1].order).toBe(1);
      expect(result.fields[2].order).toBe(2);
      expect(result.fields[0].id).toBe('field_2'); // Originally order 2, now first
      expect(result.fields[1].id).toBe('field_1'); // Originally order 5, now second
      expect(result.fields[2].id).toBe('field_3'); // Originally order 8, now third
    });

    it('should handle validation errors', async () => {
      mockValidateWithSchema.mockReturnValue({ 
        success: false, 
        error: 'Invalid template data' 
      });
      
      await expect(noteTemplateService.createTemplate(templateData))
        .rejects.toThrow('Template validation failed: Invalid template data');
    });

    it('should handle storage errors', async () => {
      mockStorageService.getNoteTemplates.mockRejectedValue(new Error('Storage error'));
      
      await expect(noteTemplateService.createTemplate(templateData))
        .rejects.toThrow('Failed to create note template');
    });
  });

  describe('updateTemplate', () => {
    const updates = {
      name: 'Updated Template',
      description: 'Updated description',
    };

    it('should update template successfully', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
      mockStorageService.setNoteTemplates.mockResolvedValue();
      
      const result = await noteTemplateService.updateTemplate('template_1', updates);
      
      expect(result).toMatchObject({
        ...mockTemplate,
        ...updates,
        id: 'template_1', // ID should not change
      });
      expect(result.updatedAt).not.toBe(mockTemplate.updatedAt);
      
      expect(mockValidateWithSchema).toHaveBeenCalledWith(NoteTemplateSchema, result);
      expect(mockStorageService.setNoteTemplates).toHaveBeenCalled();
    });

    it('should normalize field order when fields are updated', async () => {
      const fieldUpdates = {
        fields: [
          { id: 'field_1', label: 'Field 1', type: 'text' as const, required: true, order: 3 },
          { id: 'field_2', label: 'Field 2', type: 'text' as const, required: false, order: 1 },
        ],
      };
      
      mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
      mockStorageService.setNoteTemplates.mockResolvedValue();
      
      const result = await noteTemplateService.updateTemplate('template_1', fieldUpdates);
      
      expect(result.fields[0].order).toBe(0);
      expect(result.fields[1].order).toBe(1);
      expect(result.fields[0].id).toBe('field_2'); // Originally order 1, now first
      expect(result.fields[1].id).toBe('field_1'); // Originally order 3, now second
    });

    it('should throw error if template not found', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([]);
      
      await expect(noteTemplateService.updateTemplate('nonexistent', updates))
        .rejects.toThrow('Template with ID nonexistent not found');
    });

    it('should handle validation errors', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
      mockValidateWithSchema.mockReturnValue({ 
        success: false, 
        error: 'Invalid template data' 
      });
      
      await expect(noteTemplateService.updateTemplate('template_1', updates))
        .rejects.toThrow('Template validation failed: Invalid template data');
    });

    it('should handle storage errors', async () => {
      mockStorageService.getNoteTemplates.mockRejectedValue(new Error('Storage error'));
      
      await expect(noteTemplateService.updateTemplate('template_1', updates))
        .rejects.toThrow('Failed to update note template');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template successfully', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
      mockStorageService.setNoteTemplates.mockResolvedValue();
      
      await noteTemplateService.deleteTemplate('template_1');
      
      expect(mockStorageService.setNoteTemplates).toHaveBeenCalledWith([]);
    });

    it('should throw error if template not found', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([]);
      
      await expect(noteTemplateService.deleteTemplate('nonexistent'))
        .rejects.toThrow('Template with ID nonexistent not found');
    });

    it('should handle storage errors', async () => {
      mockStorageService.getNoteTemplates.mockRejectedValue(new Error('Storage error'));
      
      await expect(noteTemplateService.deleteTemplate('template_1'))
        .rejects.toThrow('Failed to delete note template');
    });
  });

  describe('getActiveTemplates', () => {
    it('should return only active templates', async () => {
      const inactiveTemplate = { ...mockTemplate, id: 'template_2', isActive: false };
      mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate, inactiveTemplate]);
      
      const result = await noteTemplateService.getActiveTemplates();
      
      expect(result).toEqual([mockTemplate]);
      expect(result).toHaveLength(1);
    });
  });

  describe('duplicateTemplate', () => {
    it('should duplicate template successfully', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
      mockStorageService.setNoteTemplates.mockResolvedValue();
      
      const result = await noteTemplateService.duplicateTemplate('template_1', 'Duplicated Template');
      
      expect(result.name).toBe('Duplicated Template');
      expect(result.id).not.toBe(mockTemplate.id);
      expect(result.fields).toHaveLength(mockTemplate.fields.length);
      expect(result.fields[0].id).not.toBe(mockTemplate.fields[0].id);
      expect(result.fields[1].id).not.toBe(mockTemplate.fields[1].id);
    });

    it('should use default name if not provided', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
      mockStorageService.setNoteTemplates.mockResolvedValue();
      
      const result = await noteTemplateService.duplicateTemplate('template_1');
      
      expect(result.name).toBe('Test Template (Copy)');
    });

    it('should throw error if original template not found', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([]);
      
      await expect(noteTemplateService.duplicateTemplate('nonexistent'))
        .rejects.toThrow('Template with ID nonexistent not found');
    });
  });

  describe('utility methods', () => {
    describe('generateFieldId', () => {
      it('should generate unique field IDs', () => {
        const id1 = noteTemplateService.generateFieldId();
        const id2 = noteTemplateService.generateFieldId();
        
        expect(id1).toMatch(/^field_\d+_[a-z0-9]+$/);
        expect(id2).toMatch(/^field_\d+_[a-z0-9]+$/);
        expect(id1).not.toBe(id2);
      });
    });

    describe('isTemplateNameUnique', () => {
      it('should return true for unique names', async () => {
        mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
        
        const result = await noteTemplateService.isTemplateNameUnique('Unique Name');
        
        expect(result).toBe(true);
      });

      it('should return false for duplicate names', async () => {
        mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
        
        const result = await noteTemplateService.isTemplateNameUnique('Test Template');
        
        expect(result).toBe(false);
      });

      it('should exclude specified ID from uniqueness check', async () => {
        mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
        
        const result = await noteTemplateService.isTemplateNameUnique('Test Template', 'template_1');
        
        expect(result).toBe(true);
      });

      it('should be case insensitive', async () => {
        mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate]);
        
        const result = await noteTemplateService.isTemplateNameUnique('test template');
        
        expect(result).toBe(false);
      });
    });

    describe('getTemplateStats', () => {
      it('should return correct statistics', async () => {
        const inactiveTemplate = { ...mockTemplate, id: 'template_2', isActive: false };
        mockStorageService.getNoteTemplates.mockResolvedValue([mockTemplate, inactiveTemplate]);
        
        const result = await noteTemplateService.getTemplateStats();
        
        expect(result).toEqual({
          totalTemplates: 2,
          activeTemplates: 1,
        });
      });
    });
  });
});
