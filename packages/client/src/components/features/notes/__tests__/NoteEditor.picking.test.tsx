/**
 * NoteEditor: choosing a new note's template (active ones only), clearing,
 * closing without changes, and a note whose task is gone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { NoteEditor } from '../NoteEditor';
import { NoteTemplatesProvider } from '../../../../contexts/NoteTemplatesContext';
import { NotificationProvider } from '../../../../contexts/NotificationContext';
import { NoteTemplate, TaskNote } from '../../../../types/notes';
import { seedAppRecords } from '../../../../testing';
import { createMockTask } from '../../../../__tests__/setup/session-test-utils';

const template = (id: string, overrides: Partial<NoteTemplate> = {}): NoteTemplate => ({
  id,
  name: `Template ${id}`,
  fields: [{ id: `${id}-field`, label: `${id} field`, type: 'text', required: false, order: 0 }],
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

type EditorProps = ComponentProps<typeof NoteEditor>;

const editor = (props: Partial<EditorProps> = {}) =>
  render(
    <NotificationProvider>
      <NoteTemplatesProvider>
        <NoteEditor
          taskId="task-1"
          template={null}
          onSaveNote={vi.fn()}
          onUpdateNote={vi.fn()}
          onDeleteNote={vi.fn()}
          isCollapsed={false}
          onToggleCollapse={() => {}}
          autoSaveDisabled
          noteLevel="task"
          {...props}
        />
      </NoteTemplatesProvider>
    </NotificationProvider>
  );

const pickTemplate = async (name: string) => {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Select Template' }));
  fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name }));
};

beforeEach(() => {
  seedAppRecords({
    noteTemplates: [
      template('standup', { description: undefined }),
      template('retired', { isActive: false }),
      template('free-form', { name: 'Free-form Note', fields: [], isActive: false }),
    ],
  });
});

describe('NoteEditor template picker', () => {
  it('offers free-form and the active templates only', async () => {
    editor();
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Select Template' }));

    const options = within(screen.getByRole('listbox')).getAllByRole('option').map(option => option.textContent);
    expect(options).toEqual(['Free-form Note', 'Template standup']);
  });

  it('switches a new note to a template and back to free-form', async () => {
    editor();
    fireEvent.change(screen.getByLabelText('Note Content'), { target: { value: 'Draft' } });

    await pickTemplate('Template standup');
    expect(screen.getByLabelText('standup field')).toHaveValue('');
    // No description to show
    expect(screen.queryByText('Template standup', { selector: '.MuiChip-label' })).not.toBeInTheDocument();

    await pickTemplate('Free-form Note');
    expect(screen.getByLabelText('Note Content')).toHaveValue('');
  });
});

describe('NoteEditor closing and clearing', () => {
  it('closes at once without changes, or with only an emptied new note', async () => {
    const onCloseEditor = vi.fn();
    editor({ onCloseEditor });

    // (A new note's Close reads Cancel)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCloseEditor).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Note Content'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Note Content'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onCloseEditor).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears an empty note without offering Undo', () => {
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('Cleared the note')).not.toBeInTheDocument();
  });
});

describe('NoteEditor for a note whose task is gone', () => {
  it('shows the task as deleted in the picker', async () => {
    const note: TaskNote = {
      id: 'n1',
      taskId: 'gone',
      templateId: 'free-form',
      templateName: 'Free-form Note',
      fieldValues: { content: 'Kept' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    editor({ existingNote: note, tasks: [createMockTask({ id: 'task-1', name: 'Annotation' })] });

    expect(await screen.findByRole('combobox', { name: 'Task' })).toHaveTextContent('Deleted task');
  });
});

describe('NoteEditor header', () => {
  it("shows a template's description, and offers to expand a collapsed editor", () => {
    editor({ template: template('described', { description: 'For daily stand-ups' }), isCollapsed: true });

    expect(screen.getByText('For daily stand-ups')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand notes' })).toBeInTheDocument();
  });
});
