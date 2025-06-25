/**
 * Tests for useNoteTemplates hook
 */

import { renderHook, act } from '@testing-library/react';
import { useNoteTemplates } from '../useNoteTemplates';
import { NoteTemplate } from '../../types/notes';

// Mock NoteTemplateService
const mockNoteTemplateService = {
  getAllTemplates: jest.fn(),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  getTemplateById: jest.fn(),
  isTemplateNameUnique: jest.fn(),
  duplicateTemplate: jest.fn(),
  toggleTemplateActive: jest.fn(),
  getActiveTemplates: jest.fn(),
  getTemplateStats: jest.fn(),
  searchTemplates: jest.fn(),
  sortTemplates: jest.fn(),
};

jest.mock('../../services/NoteTemplateService', () => ({
  NoteTemplateService: {
    getInstance: () => mockNoteTemplateService,
  },
}));

// Mock useAsyncError
const mockExecuteAsync = jest.fn();
jest.mock('../useAsyncError', () => ({
  useAsyncError: () => ({
    executeAsync: mockExecuteAsync,
  }),
}));

describe('useNoteTemplates', () => {
  const sampleTemplate: NoteTemplate = {
    id: 'template-1',
    name: 'Daily Standup',
    description: 'Template for daily standup notes',
    fields: [
      { id: 'field-1', name: 'Yesterday', type: 'text', required: true },
      { id: 'field-2', name: 'Today', type: 'text', required: true },
    ],
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const sampleTemplates: NoteTemplate[] = [
    sampleTemplate,
    {
      id: 'template-2',
      name: 'Meeting Notes',
      description: 'Template for meeting notes',
      fields: [
        { id: 'field-3', name: 'Attendees', type: 'text', required: true },
        { id: 'field-4', name: 'Action Items', type: 'textarea', required: false },
      ],
      isActive: false,
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteAsync.mockImplementation((fn) => fn());
    mockNoteTemplateService.getAllTemplates.mockResolvedValue(sampleTemplates);
    mockNoteTemplateService.isTemplateNameUnique.mockResolvedValue(true);
  });

  describe('initialization', () => {
    it('should initialize with empty templates and loading state', () => {
      const { result } = renderHook(() => useNoteTemplates());

      expect(result.current.templates).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBe(null);
    });

    it('should load templates on mount', async () => {
      const { result } = renderHook(() => useNoteTemplates());

      await act(async () => {
        // Wait for useEffect to complete
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockNoteTemplateService.getAllTemplates).toHaveBeenCalled();
      expect(result.current.templates).toEqual(sampleTemplates);
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle loading error', async () => {
      const error = new Error('Failed to load templates');
      mockNoteTemplateService.getAllTemplates.mockRejectedValue(error);

      const { result } = renderHook(() => useNoteTemplates());

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.error).toBe('Failed to load templates');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('createTemplate', () => {
    it('should create a new template successfully', async () => {
      const newTemplateData = {
        name: 'New Template',
        description: 'A new template',
        fields: [],
        isActive: true,
      };

      const createdTemplate = { ...newTemplateData, id: 'template-3', createdAt: '2024-01-03T00:00:00.000Z', updatedAt: '2024-01-03T00:00:00.000Z' };
      mockNoteTemplateService.createTemplate.mockResolvedValue(createdTemplate);

      const { result } = renderHook(() => useNoteTemplates());

      let returnedTemplate: NoteTemplate;
      await act(async () => {
        returnedTemplate = await result.current.createTemplate(newTemplateData);
      });

      expect(mockNoteTemplateService.isTemplateNameUnique).toHaveBeenCalledWith('New Template');
      expect(mockNoteTemplateService.createTemplate).toHaveBeenCalledWith(newTemplateData);
      expect(returnedTemplate!).toEqual(createdTemplate);
      expect(result.current.templates).toContain(createdTemplate);
    });

    it('should throw error for duplicate template name', async () => {
      mockNoteTemplateService.isTemplateNameUnique.mockResolvedValue(false);

      const { result } = renderHook(() => useNoteTemplates());

      await act(async () => {
        await expect(result.current.createTemplate({
          name: 'Duplicate Name',
          description: 'Test',
          fields: [],
          isActive: true,
        })).rejects.toThrow('A template with this name already exists');
      });

      expect(mockNoteTemplateService.createTemplate).not.toHaveBeenCalled();
    });
  });

  describe('updateTemplate', () => {
    it('should update template successfully', async () => {
      const updates = { name: 'Updated Template' };
      const updatedTemplate = { ...sampleTemplate, ...updates, updatedAt: '2024-01-03T00:00:00.000Z' };
      mockNoteTemplateService.updateTemplate.mockResolvedValue(updatedTemplate);

      const { result } = renderHook(() => useNoteTemplates());

      // Set initial templates
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      let returnedTemplate: NoteTemplate;
      await act(async () => {
        returnedTemplate = await result.current.updateTemplate('template-1', updates);
      });

      expect(mockNoteTemplateService.isTemplateNameUnique).toHaveBeenCalledWith('Updated Template', 'template-1');
      expect(mockNoteTemplateService.updateTemplate).toHaveBeenCalledWith('template-1', updates);
      expect(returnedTemplate!).toEqual(updatedTemplate);
      
      const updatedTemplateInState = result.current.templates.find(t => t.id === 'template-1');
      expect(updatedTemplateInState).toEqual(updatedTemplate);
    });

    it('should throw error for duplicate name when updating', async () => {
      mockNoteTemplateService.isTemplateNameUnique.mockResolvedValue(false);

      const { result } = renderHook(() => useNoteTemplates());

      await act(async () => {
        await expect(result.current.updateTemplate('template-1', { name: 'Duplicate Name' }))
          .rejects.toThrow('A template with this name already exists');
      });

      expect(mockNoteTemplateService.updateTemplate).not.toHaveBeenCalled();
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template successfully', async () => {
      mockNoteTemplateService.deleteTemplate.mockResolvedValue(undefined);

      const { result } = renderHook(() => useNoteTemplates());

      // Set initial templates
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      await act(async () => {
        await result.current.deleteTemplate('template-1');
      });

      expect(mockNoteTemplateService.deleteTemplate).toHaveBeenCalledWith('template-1');
      expect(result.current.templates.find(t => t.id === 'template-1')).toBeUndefined();
    });
  });

  describe('getTemplateById', () => {
    it('should return template by id', async () => {
      mockNoteTemplateService.getTemplateById.mockResolvedValue(sampleTemplate);

      const { result } = renderHook(() => useNoteTemplates());

      let template: NoteTemplate | null;
      await act(async () => {
        template = await result.current.getTemplateById('template-1');
      });

      expect(mockNoteTemplateService.getTemplateById).toHaveBeenCalledWith('template-1');
      expect(template!).toEqual(sampleTemplate);
    });

    it('should return null for non-existent template', async () => {
      mockNoteTemplateService.getTemplateById.mockResolvedValue(null);

      const { result } = renderHook(() => useNoteTemplates());

      let template: NoteTemplate | null;
      await act(async () => {
        template = await result.current.getTemplateById('non-existent');
      });

      expect(template).toBeNull();
    });
  });

  describe('duplicateTemplate', () => {
    it('should duplicate template with new name', async () => {
      const duplicatedTemplate = { ...sampleTemplate, id: 'template-3', name: 'Daily Standup (Copy)' };
      mockNoteTemplateService.duplicateTemplate.mockResolvedValue(duplicatedTemplate);

      const { result } = renderHook(() => useNoteTemplates());

      let template: NoteTemplate;
      await act(async () => {
        template = await result.current.duplicateTemplate('template-1', 'Daily Standup (Copy)');
      });

      expect(mockNoteTemplateService.duplicateTemplate).toHaveBeenCalledWith('template-1', 'Daily Standup (Copy)');
      expect(template!).toEqual(duplicatedTemplate);
      expect(result.current.templates).toContain(duplicatedTemplate);
    });
  });

  describe('toggleTemplateActive', () => {
    it('should toggle template active status', async () => {
      const toggledTemplate = { ...sampleTemplate, isActive: false };
      mockNoteTemplateService.toggleTemplateActive.mockResolvedValue(toggledTemplate);

      const { result } = renderHook(() => useNoteTemplates());

      // Set initial templates
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      let template: NoteTemplate;
      await act(async () => {
        template = await result.current.toggleTemplateActive('template-1');
      });

      expect(mockNoteTemplateService.toggleTemplateActive).toHaveBeenCalledWith('template-1');
      expect(template!).toEqual(toggledTemplate);
      
      const updatedTemplateInState = result.current.templates.find(t => t.id === 'template-1');
      expect(updatedTemplateInState?.isActive).toBe(false);
    });
  });

  describe('getActiveTemplates', () => {
    it('should return only active templates', () => {
      const activeTemplates = [sampleTemplate];
      mockNoteTemplateService.getActiveTemplates.mockReturnValue(activeTemplates);

      const { result } = renderHook(() => useNoteTemplates());

      const active = result.current.getActiveTemplates();

      expect(mockNoteTemplateService.getActiveTemplates).toHaveBeenCalled();
      expect(active).toEqual(activeTemplates);
    });
  });

  describe('getTemplateStats', () => {
    it('should return template statistics', () => {
      const stats = { totalTemplates: 2, activeTemplates: 1, inactiveTemplates: 1 };
      mockNoteTemplateService.getTemplateStats.mockReturnValue(stats);

      const { result } = renderHook(() => useNoteTemplates());

      const templateStats = result.current.getTemplateStats();

      expect(mockNoteTemplateService.getTemplateStats).toHaveBeenCalled();
      expect(templateStats).toEqual(stats);
    });
  });

  describe('searchTemplates', () => {
    it('should search templates by query', () => {
      const searchResults = [sampleTemplate];
      mockNoteTemplateService.searchTemplates.mockReturnValue(searchResults);

      const { result } = renderHook(() => useNoteTemplates());

      const results = result.current.searchTemplates('standup');

      expect(mockNoteTemplateService.searchTemplates).toHaveBeenCalledWith('standup');
      expect(results).toEqual(searchResults);
    });
  });

  describe('sortTemplates', () => {
    it('should sort templates by specified criteria', () => {
      const sortedTemplates = [...sampleTemplates].reverse();
      mockNoteTemplateService.sortTemplates.mockReturnValue(sortedTemplates);

      const { result } = renderHook(() => useNoteTemplates());

      const sorted = result.current.sortTemplates('name', 'desc');

      expect(mockNoteTemplateService.sortTemplates).toHaveBeenCalledWith('name', 'desc');
      expect(sorted).toEqual(sortedTemplates);
    });
  });

  describe('refreshTemplates', () => {
    it('should reload templates from service', async () => {
      const { result } = renderHook(() => useNoteTemplates());

      await act(async () => {
        await result.current.refreshTemplates();
      });

      expect(mockNoteTemplateService.getAllTemplates).toHaveBeenCalledTimes(2); // Once on mount, once on refresh
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      const error = new Error('Service error');
      mockNoteTemplateService.createTemplate.mockRejectedValue(error);
      mockExecuteAsync.mockImplementation(async (fn) => {
        try {
          return await fn();
        } catch (err) {
          throw err;
        }
      });

      const { result } = renderHook(() => useNoteTemplates());

      await act(async () => {
        await expect(result.current.createTemplate({
          name: 'Test',
          description: 'Test',
          fields: [],
          isActive: true,
        })).rejects.toThrow('Service error');
      });
    });
  });

  describe('return values', () => {
    it('should return all expected properties and methods', () => {
      const { result } = renderHook(() => useNoteTemplates());

      // State properties
      expect(result.current).toHaveProperty('templates');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('error');

      // CRUD methods
      expect(result.current).toHaveProperty('createTemplate');
      expect(result.current).toHaveProperty('updateTemplate');
      expect(result.current).toHaveProperty('deleteTemplate');
      expect(result.current).toHaveProperty('getTemplateById');

      // Utility methods
      expect(result.current).toHaveProperty('duplicateTemplate');
      expect(result.current).toHaveProperty('toggleTemplateActive');
      expect(result.current).toHaveProperty('getActiveTemplates');
      expect(result.current).toHaveProperty('getTemplateStats');
      expect(result.current).toHaveProperty('searchTemplates');
      expect(result.current).toHaveProperty('sortTemplates');
      expect(result.current).toHaveProperty('refreshTemplates');

      // Verify all methods are functions
      expect(typeof result.current.createTemplate).toBe('function');
      expect(typeof result.current.updateTemplate).toBe('function');
      expect(typeof result.current.deleteTemplate).toBe('function');
      expect(typeof result.current.getTemplateById).toBe('function');
      expect(typeof result.current.duplicateTemplate).toBe('function');
      expect(typeof result.current.toggleTemplateActive).toBe('function');
      expect(typeof result.current.getActiveTemplates).toBe('function');
      expect(typeof result.current.getTemplateStats).toBe('function');
      expect(typeof result.current.searchTemplates).toBe('function');
      expect(typeof result.current.sortTemplates).toBe('function');
      expect(typeof result.current.refreshTemplates).toBe('function');
    });
  });
});
