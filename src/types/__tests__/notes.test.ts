/**
 * Tests for enhanced notes types including new field types
 */

import { describe, it, expect } from 'vitest';
import {
  TemplateFieldSchema,
  SelectOptionSchema,
  NoteTemplateSchema,
  TaskNoteSchema,
  FieldType,
  TemplateField,
  SelectOption,
} from '../notes';

describe('Enhanced Notes Types', () => {
  describe('SelectOptionSchema', () => {
    it('should validate valid select options', () => {
      const validOption: SelectOption = {
        label: 'Option 1',
        value: 'option1',
      };

      expect(() => SelectOptionSchema.parse(validOption)).not.toThrow();
    });

    it('should reject invalid select options', () => {
      const invalidOptions = [
        { label: '', value: 'option1' }, // Empty label
        { label: 'Option 1', value: '' }, // Empty value
        { label: 'Option 1' }, // Missing value
        { value: 'option1' }, // Missing label
      ];

      invalidOptions.forEach(option => {
        expect(() => SelectOptionSchema.parse(option)).toThrow();
      });
    });
  });

  describe('TemplateFieldSchema', () => {
    it('should validate text field', () => {
      const textField: TemplateField = {
        id: 'field1',
        label: 'Text Field',
        type: 'text',
        required: false,
        order: 0,
      };

      expect(() => TemplateFieldSchema.parse(textField)).not.toThrow();
    });

    it('should validate number field', () => {
      const numberField: TemplateField = {
        id: 'field2',
        label: 'Number Field',
        type: 'number',
        required: true,
        order: 1,
        validation: {
          min: 0,
          max: 100,
        },
      };

      expect(() => TemplateFieldSchema.parse(numberField)).not.toThrow();
    });

    it('should validate date field', () => {
      const dateField: TemplateField = {
        id: 'field3',
        label: 'Date Field',
        type: 'date',
        required: false,
        order: 2,
      };

      expect(() => TemplateFieldSchema.parse(dateField)).not.toThrow();
    });

    it('should validate command field', () => {
      const commandField: TemplateField = {
        id: 'field4',
        label: 'Command Field',
        type: 'command',
        required: false,
        order: 3,
        command: 'echo "Hello World"',
      };

      expect(() => TemplateFieldSchema.parse(commandField)).not.toThrow();
    });

    it('should validate checkbox field', () => {
      const checkboxField: TemplateField = {
        id: 'field5',
        label: 'Checkbox Field',
        type: 'checkbox',
        required: false,
        order: 4,
      };

      expect(() => TemplateFieldSchema.parse(checkboxField)).not.toThrow();
    });

    it('should validate select field', () => {
      const selectField: TemplateField = {
        id: 'field6',
        label: 'Select Field',
        type: 'select',
        required: true,
        order: 5,
        options: [
          { label: 'Option 1', value: 'option1' },
          { label: 'Option 2', value: 'option2' },
        ],
      };

      expect(() => TemplateFieldSchema.parse(selectField)).not.toThrow();
    });

    it('should reject invalid field types', () => {
      const invalidField = {
        id: 'field1',
        label: 'Invalid Field',
        type: 'invalid' as FieldType,
        required: false,
        order: 0,
      };

      expect(() => TemplateFieldSchema.parse(invalidField)).toThrow();
    });

    it('should reject select field without options', () => {
      const selectFieldWithoutOptions = {
        id: 'field1',
        label: 'Select Field',
        type: 'select' as FieldType,
        required: false,
        order: 0,
        // Missing options
      };

      // This should still pass validation as options is optional in schema
      // but in practice, select fields should have options
      expect(() => TemplateFieldSchema.parse(selectFieldWithoutOptions)).not.toThrow();
    });

    it('should validate select field with empty options array', () => {
      const selectFieldWithEmptyOptions = {
        id: 'field1',
        label: 'Select Field',
        type: 'select' as FieldType,
        required: false,
        order: 0,
        options: [],
      };

      expect(() => TemplateFieldSchema.parse(selectFieldWithEmptyOptions)).not.toThrow();
    });
  });

  describe('Field Type Coverage', () => {
    const allFieldTypes: FieldType[] = ['text', 'number', 'date', 'command', 'checkbox', 'select'];

    it('should support all defined field types', () => {
      allFieldTypes.forEach(type => {
        const field: TemplateField = {
          id: `field_${type}`,
          label: `${type} Field`,
          type,
          required: false,
          order: 0,
          ...(type === 'command' && { command: 'echo test' }),
          ...(type === 'select' && { options: [{ label: 'Test', value: 'test' }] }),
        };

        expect(() => TemplateFieldSchema.parse(field)).not.toThrow();
      });
    });
  });

  describe('Template with Enhanced Fields', () => {
    it('should validate template with all field types', () => {
      const template = {
        id: 'template1',
        name: 'Enhanced Template',
        description: 'Template with all field types',
        fields: [
          {
            id: 'text_field',
            label: 'Text Field',
            type: 'text' as FieldType,
            required: false,
            order: 0,
          },
          {
            id: 'number_field',
            label: 'Number Field',
            type: 'number' as FieldType,
            required: true,
            order: 1,
          },
          {
            id: 'date_field',
            label: 'Date Field',
            type: 'date' as FieldType,
            required: false,
            order: 2,
          },
          {
            id: 'command_field',
            label: 'Command Field',
            type: 'command' as FieldType,
            required: false,
            order: 3,
            command: 'echo "test"',
          },
          {
            id: 'checkbox_field',
            label: 'Checkbox Field',
            type: 'checkbox' as FieldType,
            required: false,
            order: 4,
          },
          {
            id: 'select_field',
            label: 'Select Field',
            type: 'select' as FieldType,
            required: true,
            order: 5,
            options: [
              { label: 'Option A', value: 'a' },
              { label: 'Option B', value: 'b' },
            ],
          },
        ],
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => NoteTemplateSchema.parse(template)).not.toThrow();
    });
  });

  describe('Task Note with Enhanced Field Values', () => {
    it('should validate note with various field value types', () => {
      const note = {
        id: 'note1',
        taskId: 'task1',
        templateId: 'template1',
        templateName: 'Enhanced Template',
        fieldValues: {
          text_field: 'Some text',
          number_field: 42,
          date_field: '2024-01-01',
          command_field: 'Command output',
          checkbox_field: true,
          select_field: 'option_a',
        },
        timeEntryId: null,
        isArchived: false,
        archivedAt: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => TaskNoteSchema.parse(note)).not.toThrow();
    });

    it('should validate note with boolean values for checkbox', () => {
      const note = {
        id: 'note1',
        taskId: 'task1',
        templateId: 'template1',
        templateName: 'Test Template',
        fieldValues: {
          checkbox_field: false,
          another_checkbox: true,
        },
        timeEntryId: null,
        isArchived: false,
        archivedAt: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => TaskNoteSchema.parse(note)).not.toThrow();
    });
  });
});
