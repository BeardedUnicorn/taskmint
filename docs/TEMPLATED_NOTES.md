# Templated Notes Feature

## Overview

The Templated Notes feature provides a comprehensive system for creating structured, reusable note templates and associating them with tasks. This feature enables users to capture consistent information across tasks using predefined field structures.

## Features

### 1. Note Templates Management
- **Create Templates**: Define custom templates with multiple field types
- **Field Types**: Support for Text, Number, and Date fields
- **Field Validation**: Required fields, min/max values, pattern matching
- **Template Activation**: Enable/disable templates as needed
- **Template Duplication**: Copy existing templates for quick setup

### 2. Template Builder Interface
- **Split-pane Layout**: Template list on left, builder on right
- **Drag-and-drop**: Reorder fields with visual feedback
- **Real-time Preview**: See how fields will appear to users
- **Field Configuration**: Label, type, validation, and placeholder settings

### 3. Task Integration
- **Template Selection**: Choose templates for specific tasks
- **Notes Editor**: Dynamic form generation based on selected template
- **Collapsible Interface**: Expandable notes section in task details
- **Auto-save**: Real-time saving with status indicators

### 4. Notes Management
- **CRUD Operations**: Create, read, update, delete notes
- **Notes History**: View all notes for a task with timestamps
- **Search & Filter**: Find notes by content or template
- **Statistics**: Track note usage and template adoption

## Architecture

### Components

#### Core Components
- `TemplateBuilder`: Main template management interface
- `FieldEditor`: Individual field configuration component
- `NoteEditor`: Dynamic form generator for note creation/editing
- `NotesList`: Display and manage existing notes
- `TaskDetail`: Enhanced task view with notes integration
- `TaskNotesIntegration`: Unified notes interface for tasks

#### Services
- `NoteTemplateService`: Template CRUD operations and validation
- `TaskNotesService`: Note management and field validation
- `StorageService`: Extended for template and note persistence

#### Hooks
- `useNoteTemplates`: Template state management and operations
- `useTaskNotes`: Note state management and operations

### Data Models

#### NoteTemplate
```typescript
interface NoteTemplate {
  id: string;
  name: string;
  description?: string;
  fields: TemplateField[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}
```

#### TemplateField
```typescript
interface TemplateField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date';
  required: boolean;
  placeholder?: string;
  order: number;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}
```

#### TaskNote
```typescript
interface TaskNote {
  id: string;
  taskId: string;
  templateId: string;
  templateName: string;
  fieldValues: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

## Usage

### Creating Templates

1. Navigate to "Note Templates" tab
2. Click "New Template"
3. Enter template name and description
4. Add fields using "Add Field" button
5. Configure each field:
   - Set label and type
   - Mark as required if needed
   - Add validation rules
   - Set placeholder text
6. Save template

### Using Templates with Tasks

1. Open task details view
2. Select a template from dropdown
3. Fill in the form fields
4. Click "Save Note"
5. View saved notes in the notes list

### Managing Notes

- **Edit**: Click edit button on any note
- **Delete**: Click delete button with confirmation
- **View History**: All notes are listed with timestamps
- **Search**: Use search functionality to find specific notes

## Field Types

### Text Fields
- Multiline text input
- Min/max length validation
- Pattern (regex) validation
- Placeholder text support

### Number Fields
- Numeric input with validation
- Min/max value constraints
- Decimal support
- Step validation

### Date Fields
- Date picker interface
- Date format validation
- Range constraints (future implementation)

## Validation

### Template Validation
- Unique template names
- Required field labels
- Valid field configurations
- Proper field ordering

### Note Validation
- Required field checking
- Type-specific validation
- Field value constraints
- Template compatibility

## Storage

### Local Storage Keys
- `noteTemplates`: Template definitions
- `taskNotes`: Task note instances

### Data Migration
- Automatic schema migration
- Backward compatibility
- Data backup before migration

## Performance Considerations

### Optimization Features
- Template caching in services
- Lazy loading of note data
- Efficient field validation
- Minimal re-renders with React hooks

### Memory Management
- Service singleton patterns
- Cleanup of unused data
- Efficient state updates

## Testing

### Test Coverage
- Unit tests for services
- Integration tests for workflows
- Component testing with React Testing Library
- End-to-end testing scenarios

### Test Files
- `src/__tests__/integration/notes-integration.test.tsx`
- Service-specific unit tests
- Component interaction tests

## Future Enhancements

### Planned Features
- Template versioning
- Field dependencies and conditional logic
- Rich text editor for text fields
- File attachment support
- Template sharing and import/export
- Advanced search and filtering
- Note templates for different task types
- Bulk operations on notes
- Note templates marketplace

### Technical Improvements
- Virtual scrolling for large note lists
- Offline support with sync
- Real-time collaboration
- Advanced validation rules
- Custom field types
- Template inheritance

## Troubleshooting

### Common Issues

#### Templates Not Appearing
- Check if templates are marked as active
- Verify template creation was successful
- Clear browser cache if needed

#### Notes Not Saving
- Ensure all required fields are filled
- Check field validation errors
- Verify template still exists

#### Performance Issues
- Clear old note data if excessive
- Check browser storage limits
- Optimize template complexity

### Debug Information
- Service logs in browser console
- Storage inspection in DevTools
- Component state debugging
- Network request monitoring

## API Reference

### NoteTemplateService Methods
- `getAllTemplates()`: Get all templates
- `createTemplate(data)`: Create new template
- `updateTemplate(id, updates)`: Update template
- `deleteTemplate(id)`: Delete template
- `getActiveTemplates()`: Get active templates only

### TaskNotesService Methods
- `getAllNotes()`: Get all notes
- `createNote(data)`: Create new note
- `updateNote(id, updates)`: Update note
- `deleteNote(id)`: Delete note
- `getNotesByTaskId(taskId)`: Get notes for specific task

### Hook APIs
- `useNoteTemplates()`: Template management hook
- `useTaskNotes(taskId?)`: Note management hook

## Contributing

### Development Guidelines
- Follow existing TypeScript patterns
- Maintain component single responsibility
- Add comprehensive tests for new features
- Update documentation for API changes
- Follow dark theme design patterns

### Code Style
- Use descriptive component and function names
- Implement proper error handling
- Add JSDoc comments for complex functions
- Follow existing file organization patterns
