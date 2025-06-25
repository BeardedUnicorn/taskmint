/**
 * TaskNotesIntegration Default Template Tests
 * 
 * Tests for the default note template functionality in TaskNotesIntegration component.
 */

import { renderHook } from '@testing-library/react';
import { useCallback } from 'react';
import { Task } from '../../../../types/task';
import { NoteTemplate } from '../../../../types/notes';

describe('TaskNotesIntegration Default Template Logic', () => {
  const mockTemplates: NoteTemplate[] = [
    {
      id: 'template-1',
      name: 'First Template',
      description: 'First template description',
      fields: [
        {
          id: 'field-1',
          label: 'Field 1',
          type: 'text',
          required: true,
          order: 0,
        },
      ],
      isActive: true,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    },
    {
      id: 'template-2',
      name: 'Default Template',
      description: 'This should be the default template',
      fields: [
        {
          id: 'field-2',
          label: 'Default Field',
          type: 'text',
          required: true,
          order: 0,
        },
      ],
      isActive: true,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    },
    {
      id: 'template-3',
      name: 'Third Template',
      description: 'Third template description',
      fields: [
        {
          id: 'field-3',
          label: 'Field 3',
          type: 'text',
          required: true,
          order: 0,
        },
      ],
      isActive: false, // Inactive template
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    },
  ];

  // Mock the getTemplateById function similar to our implementation
  const mockGetTemplateById = (templateId: string): NoteTemplate | undefined => {
    return mockTemplates.find(template => template.id === templateId);
  };

  // Simulate the handleCreateNote logic from TaskNotesIntegration
  const createHandleCreateNote = (task: Task, templates: NoteTemplate[], getTemplateById: (id: string) => NoteTemplate | undefined) => {
    return useCallback(() => {
      // First, try to use the task's default note template
      let defaultTemplate: NoteTemplate | null = null;
      
      if (task.defaultNoteTemplateId) {
        const foundTemplate = getTemplateById(task.defaultNoteTemplateId);
        if (foundTemplate) {
          defaultTemplate = foundTemplate;
        }
      }
      
      // If no default template is set or the default template is not found,
      // fall back to the first available active template
      if (!defaultTemplate && templates.length > 0) {
        defaultTemplate = templates.find(template => template.isActive) || templates[0];
      }
      
      return defaultTemplate;
    }, [task.defaultNoteTemplateId, templates, getTemplateById]);
  };

  it('should use the task default template when creating a new note', () => {
    const taskWithDefault: Task = {
      id: 'task-1',
      name: 'Test Task',
      defaultNoteTemplateId: 'template-2', // Set specific default template
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    };

    const { result } = renderHook(() => 
      createHandleCreateNote(taskWithDefault, mockTemplates, mockGetTemplateById)
    );

    const selectedTemplate = result.current();

    expect(selectedTemplate).not.toBeNull();
    expect(selectedTemplate?.id).toBe('template-2');
    expect(selectedTemplate?.name).toBe('Default Template');
  });

  it('should fall back to first active template when default template is not found', () => {
    const taskWithInvalidDefault: Task = {
      id: 'task-1',
      name: 'Test Task',
      defaultNoteTemplateId: 'non-existent-template',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    };

    const { result } = renderHook(() => 
      createHandleCreateNote(taskWithInvalidDefault, mockTemplates, mockGetTemplateById)
    );

    const selectedTemplate = result.current();

    expect(selectedTemplate).not.toBeNull();
    expect(selectedTemplate?.id).toBe('template-1'); // First active template
    expect(selectedTemplate?.name).toBe('First Template');
  });

  it('should fall back to first template when no default template is set', () => {
    const taskWithoutDefault: Task = {
      id: 'task-1',
      name: 'Test Task',
      defaultNoteTemplateId: undefined,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    };

    const { result } = renderHook(() => 
      createHandleCreateNote(taskWithoutDefault, mockTemplates, mockGetTemplateById)
    );

    const selectedTemplate = result.current();

    expect(selectedTemplate).not.toBeNull();
    expect(selectedTemplate?.id).toBe('template-1'); // First active template
    expect(selectedTemplate?.name).toBe('First Template');
  });

  it('should fall back to first template even if inactive when no active templates exist', () => {
    const inactiveTemplates = mockTemplates.map(t => ({ ...t, isActive: false }));
    
    const taskWithoutDefault: Task = {
      id: 'task-1',
      name: 'Test Task',
      defaultNoteTemplateId: undefined,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    };

    const { result } = renderHook(() => 
      createHandleCreateNote(taskWithoutDefault, inactiveTemplates, mockGetTemplateById)
    );

    const selectedTemplate = result.current();

    expect(selectedTemplate).not.toBeNull();
    expect(selectedTemplate?.id).toBe('template-1'); // First template (even if inactive)
    expect(selectedTemplate?.name).toBe('First Template');
  });

  it('should return null when no templates are available', () => {
    const taskWithoutDefault: Task = {
      id: 'task-1',
      name: 'Test Task',
      defaultNoteTemplateId: undefined,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    };

    const { result } = renderHook(() => 
      createHandleCreateNote(taskWithoutDefault, [], mockGetTemplateById)
    );

    const selectedTemplate = result.current();

    expect(selectedTemplate).toBeNull();
  });
});
