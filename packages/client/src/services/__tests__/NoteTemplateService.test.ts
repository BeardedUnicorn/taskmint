/**
 * NoteTemplateService Tests
 *
 * Covers template CRUD operations, activation toggles, and validation rules.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoteTemplateService } from '../NoteTemplateService';
import { StorageService } from '../StorageService';
import { NoteTemplate } from '../../types/notes';

vi.mock('../StorageService', () => ({
  StorageService: {
    getInstance: vi.fn(),
  },
}));

describe('NoteTemplateService', () => {
  let service: NoteTemplateService;
  let mockStorageService: any;

  const freeFormTemplate: NoteTemplate = {
    id: 'free-form',
    name: 'Free-form Note',
    description: 'Default template for free-form notes',
    fields: [],
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
    isActive: false,
  };

  beforeEach(() => {
    mockStorageService = {
      getNoteTemplates: vi.fn().mockResolvedValue([freeFormTemplate]),
      setNoteTemplates: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(StorageService.getInstance).mockReturnValue(mockStorageService);
    service = new NoteTemplateService();
  });

  describe('CRUD operations', () => {
    it('should create and retrieve a template', async () => {
      const templateData = {
        name: 'Test Template',
        description: 'Template description',
        fields: [],
        isActive: true,
      };

      const created = await service.createTemplate(templateData);

      expect(created).toMatchObject({
        ...templateData,
        id: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(mockStorageService.setNoteTemplates).toHaveBeenCalledWith([freeFormTemplate, created]);

      const fetched = await service.getTemplateById(created.id);
      expect(fetched).toEqual(created);
      expect(mockStorageService.getNoteTemplates).toHaveBeenCalledTimes(1);
    });

    it('should update template activation status', async () => {
      const existing: NoteTemplate = {
        id: 'template1',
        name: 'Template 1',
        description: 'desc',
        fields: [],
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        isActive: false,
      };
      mockStorageService.getNoteTemplates.mockResolvedValue([existing, freeFormTemplate]);

      const updated = await service.updateTemplate('template1', { isActive: true });

      expect(updated.isActive).toBe(true);
      expect(mockStorageService.setNoteTemplates).toHaveBeenCalledWith([updated, freeFormTemplate]);
    });

    it('should delete template and update storage', async () => {
      const existing: NoteTemplate = {
        id: 'template1',
        name: 'Template 1',
        description: 'desc',
        fields: [],
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        isActive: true,
      };
      mockStorageService.getNoteTemplates.mockResolvedValue([existing, freeFormTemplate]);

      await service.deleteTemplate('template1');

      expect(mockStorageService.setNoteTemplates).toHaveBeenCalledWith([freeFormTemplate]);

      mockStorageService.getNoteTemplates.mockResolvedValue([freeFormTemplate]);
      const result = await service.getTemplateById('template1');
      expect(result).toBeNull();
    });
  });

  describe('validation rules', () => {
    it('should throw error when creating invalid template', async () => {
      const invalidData = {
        name: '',
        description: 'desc',
        fields: [],
        isActive: true,
      };

      await expect(service.createTemplate(invalidData)).rejects.toThrow('Failed to create note template');
      expect(mockStorageService.setNoteTemplates).not.toHaveBeenCalled();
    });

    it('should throw error when updating template with invalid data', async () => {
      const existing: NoteTemplate = {
        id: 'template1',
        name: 'Template 1',
        description: 'desc',
        fields: [],
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        isActive: false,
      };
      mockStorageService.getNoteTemplates.mockResolvedValue([existing, freeFormTemplate]);

      await expect(service.updateTemplate('template1', { name: '' })).rejects.toThrow('Failed to update note template');
      expect(mockStorageService.setNoteTemplates).not.toHaveBeenCalled();
    });
  });

  describe('templates that are missing or unreadable', () => {
    const field = (id: string, order: number) => ({ id, label: id, type: 'text' as const, required: false, order });
    const existing: NoteTemplate = { ...freeFormTemplate, id: 'template1', name: 'Daily Log', isActive: true };

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it("refuses to update or delete a template that isn't there", async () => {
      await expect(service.updateTemplate('missing', { name: 'x' })).rejects.toThrow('Failed to update note template');
      await expect(service.deleteTemplate('missing')).rejects.toThrow('Failed to delete note template');
    });

    it("says when the templates can't be read, and finds none", async () => {
      mockStorageService.getNoteTemplates.mockRejectedValue(new Error('storage gone'));
      await expect(service.getAllTemplates()).rejects.toThrow('Failed to load note templates');
      expect(await service.getTemplateById('template1')).toBeNull();
    });

    it('numbers fields in their order', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([existing, freeFormTemplate]);
      const updated = await service.updateTemplate('template1', { fields: [field('b', 5), field('a', 2)] });
      expect(updated.fields.map(f => [f.id, f.order])).toEqual([
        ['a', 0],
        ['b', 1],
      ]);
    });

    it('knows whether a name is taken, ignoring case and the template being renamed', async () => {
      mockStorageService.getNoteTemplates.mockResolvedValue([existing, freeFormTemplate]);
      expect(await service.isTemplateNameUnique('daily log')).toBe(false);
      expect(await service.isTemplateNameUnique('Daily Log', 'template1')).toBe(true);
      expect(await service.isTemplateNameUnique('Weekly')).toBe(true);
    });
  });
});
