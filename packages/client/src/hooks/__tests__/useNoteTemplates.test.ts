import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
// The state hook itself (useNoteTemplates reads it from NoteTemplatesProvider)
import { useNoteTemplatesState, useNoteTemplates } from '../useNoteTemplates';
import { NoteTemplateService } from '../../services/NoteTemplateService';
import { NoteTemplate } from '../../types/notes';
import { announceAppRecordsChange } from '../../testing';

vi.mock('../../services/NoteTemplateService');

const mockTemplateService = {
  getAllTemplates: vi.fn(),
  isTemplateNameUnique: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
};

beforeEach(() => {
  vi.mocked(NoteTemplateService.getInstance).mockReturnValue(mockTemplateService as never);
  mockTemplateService.isTemplateNameUnique.mockResolvedValue(true);
});

const template = (id: string, name = `Template ${id}`, isActive = true): NoteTemplate => ({
  id,
  name,
  fields: [],
  isActive,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

const loaded = async (templates: NoteTemplate[]) => {
  mockTemplateService.getAllTemplates.mockResolvedValue(templates);
  const hook = renderHook(() => useNoteTemplatesState());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook.result;
};

describe('useNoteTemplatesState', () => {
  it('loads every template, and is loading until then', async () => {
    mockTemplateService.getAllTemplates.mockResolvedValue([template('1'), template('2')]);
    const { result } = renderHook(() => useNoteTemplatesState());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.templates.map(t => t.id)).toEqual(['1', '2']);
    expect(result.current.error).toBeNull();
  });

  it('keeps the load error as a message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockTemplateService.getAllTemplates.mockRejectedValue('disk unreadable');
    const { result } = renderHook(() => useNoteTemplatesState());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('disk unreadable');
    expect(error).toHaveBeenCalledWith('Failed to load templates:', 'disk unreadable');
    error.mockRestore();
  });

  it('creates a template with a new name', async () => {
    const result = await loaded([template('1')]);
    mockTemplateService.createTemplate.mockResolvedValue(template('2', 'Standup'));

    await act(async () => {
      await result.current.createTemplate({ name: 'Standup', fields: [], isActive: true });
    });

    expect(mockTemplateService.isTemplateNameUnique).toHaveBeenCalledWith('Standup');
    expect(result.current.templates.map(t => t.id)).toEqual(['1', '2']);
  });

  it("won't create a second template with a name in use", async () => {
    const result = await loaded([template('1', 'Standup')]);
    mockTemplateService.isTemplateNameUnique.mockResolvedValue(false);

    await expect(result.current.createTemplate({ name: 'Standup', fields: [], isActive: true })).rejects.toThrow(
      'A template with this name already exists'
    );
    expect(mockTemplateService.createTemplate).not.toHaveBeenCalled();
    expect(result.current.templates).toHaveLength(1);
  });

  it('renames a template to a name not in use by another', async () => {
    const result = await loaded([template('1'), template('2')]);
    mockTemplateService.updateTemplate.mockResolvedValue(template('2', 'Renamed'));

    await act(async () => {
      await result.current.updateTemplate('2', { name: 'Renamed' });
    });

    expect(mockTemplateService.isTemplateNameUnique).toHaveBeenCalledWith('Renamed', '2');
    expect(result.current.templates.map(t => t.name)).toEqual(['Template 1', 'Renamed']);
  });

  it("won't rename a template to another's name", async () => {
    const result = await loaded([template('1', 'Standup'), template('2')]);
    mockTemplateService.isTemplateNameUnique.mockResolvedValue(false);

    await expect(result.current.updateTemplate('2', { name: 'Standup' })).rejects.toThrow(
      'A template with this name already exists'
    );
    expect(mockTemplateService.updateTemplate).not.toHaveBeenCalled();
  });

  it('updates without a name check when the name stays', async () => {
    const result = await loaded([template('1')]);
    mockTemplateService.updateTemplate.mockResolvedValue(template('1', 'Template 1', false));

    await act(async () => {
      await result.current.updateTemplate('1', { isActive: false });
    });

    expect(mockTemplateService.isTemplateNameUnique).not.toHaveBeenCalled();
    expect(result.current.templates[0].isActive).toBe(false);
  });

  it('deletes a template from the shared list', async () => {
    const result = await loaded([template('1'), template('2')]);
    mockTemplateService.deleteTemplate.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.deleteTemplate('1');
    });

    expect(mockTemplateService.deleteTemplate).toHaveBeenCalledWith('1');
    expect(result.current.templates.map(t => t.id)).toEqual(['2']);
  });

  it('finds a template by id, and lists the active ones', async () => {
    const result = await loaded([template('1'), template('2', 'Old', false)]);

    expect(result.current.getTemplateById('2')?.name).toBe('Old');
    expect(result.current.getTemplateById('missing')).toBeUndefined();
    expect(result.current.getActiveTemplates().map(t => t.id)).toEqual(['1']);
  });

  it('logs a failed reload of templates saved elsewhere, keeping the list', async () => {
    const result = await loaded([template('1')]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockTemplateService.getAllTemplates.mockRejectedValueOnce(new Error('unreadable'));

    act(() => announceAppRecordsChange({ keys: ['noteTemplates'], conflict: false }));

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to reload templates:', expect.any(Error)));
    expect(result.current.templates).toHaveLength(1);
    error.mockRestore();
  });
});

describe('useNoteTemplates', () => {
  it('needs the provider', () => {
    expect(() => renderHook(() => useNoteTemplates())).toThrow(/NoteTemplatesProvider/);
  });
});
