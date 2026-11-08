/**
 * NoteTemplateBuilder: the template list, and the editor for the selected
 * (or a new) template and its fields. One toast per action says how it went.
 */

import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NoteTemplateBuilder } from '../NoteTemplateBuilder';
import { NoteTemplate, TemplateField } from '../../../../types/notes';
import { createNotificationMock } from '../../../../__tests__/setup/notificationMock';

const notifications = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof createNotificationMock> }));
vi.mock('../../../../contexts/NotificationContext', () => ({ useNotification: () => notifications.current }));

const field = (id: string, label: string, order: number): TemplateField => ({
  id,
  label,
  type: 'text',
  required: false,
  order,
});

const template = (overrides: Partial<NoteTemplate> = {}): NoteTemplate => ({
  id: 't1',
  name: 'Standup',
  description: 'Daily notes',
  fields: [field('f2', 'Blockers', 1), field('f1', 'Done', 0)],
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

/** The builder under a parent that keeps the selection, as the page does. */
function renderBuilder(templates: NoteTemplate[] = []) {
  const handlers = {
    create: vi.fn(async (data: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt'>) =>
      template({ ...data, id: 'new' })
    ),
    update: vi.fn(async (id: string, updates: Partial<NoteTemplate>) => template({ id, ...updates })),
    remove: vi.fn(async () => {}),
  };
  function Page() {
    const [selected, setSelected] = useState<NoteTemplate | null>(null);
    return (
      <NoteTemplateBuilder
        templates={templates}
        onCreateTemplate={handlers.create}
        onUpdateTemplate={handlers.update}
        onDeleteTemplate={handlers.remove}
        onSelectTemplate={setSelected}
        selectedTemplate={selected}
      />
    );
  }
  render(<Page />);
  return handlers;
}

const name = () => screen.getByRole('textbox', { name: /Template Name/ });
const describeAs = (text: string) =>
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: text } });
const fieldLabels = () =>
  screen.queryAllByPlaceholderText('Field Label').map(input => (input as HTMLInputElement).value);
const click = (label: string | RegExp) => fireEvent.click(screen.getByRole('button', { name: label }));

beforeEach(() => {
  notifications.current = createNotificationMock();
});

describe('NoteTemplateBuilder', () => {
  it('says when there are no templates, and asks to pick one', () => {
    renderBuilder();
    expect(screen.getByText('No templates yet')).toBeInTheDocument();
    expect(screen.getByText('Select a Template')).toBeInTheDocument();
  });

  it('lists each template with its field count, description and state', () => {
    renderBuilder([
      template(),
      template({ id: 't2', name: 'Retro', description: undefined, isActive: false, fields: [] }),
    ]);

    const [standup, retro] = screen.getAllByRole('listitem');
    expect(within(standup).getByText('2')).toBeInTheDocument();
    expect(within(standup).getByText('Daily notes')).toBeInTheDocument();
    expect(within(retro).getByText('Inactive')).toBeInTheDocument();
    expect(within(retro).getByText('No description')).toBeInTheDocument();
  });

  it('creates a template from a name, a description and its fields', async () => {
    const { create } = renderBuilder();
    click('New Template');
    expect(screen.getByRole('button', { name: 'Create Template' })).toBeDisabled();
    expect(screen.getByText(/No fields added yet/)).toBeInTheDocument();

    fireEvent.change(name(), { target: { value: '  Review  ' } });
    describeAs('  For reviews  ');
    click('Add Field');
    click('Create Template');

    await waitFor(() =>
      expect(notifications.current.showSuccess).toHaveBeenCalledWith('Template created', { category: 'template' })
    );
    expect(create).toHaveBeenCalledWith({
      name: 'Review',
      description: 'For reviews',
      fields: [expect.objectContaining({ label: 'New Field', type: 'text', order: 0 })],
      isActive: true,
    });
    // The new template is the one selected now
    expect(screen.getByRole('button', { name: 'Update Template' })).toBeInTheDocument();
  });

  it('saves no description when it is blank, and says why a save failed', async () => {
    const { create } = renderBuilder();
    create.mockRejectedValueOnce(new Error('A template with this name already exists'));
    click('New Template');
    fireEvent.change(name(), { target: { value: 'Standup' } });
    describeAs('   ');
    click('Create Template');

    await waitFor(() =>
      expect(notifications.current.showError).toHaveBeenCalledWith('A template with this name already exists', {
        category: 'template',
      })
    );
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ description: undefined }));
  });

  it('starts a new template over on Cancel', () => {
    renderBuilder();
    click('New Template');
    fireEvent.change(name(), { target: { value: 'Draft' } });
    click('Add Field');

    click('Cancel');
    expect(name()).toHaveValue('');
    expect(fieldLabels()).toEqual([]);
  });

  it('opens a template with its fields in order, and puts edits back on Cancel', () => {
    renderBuilder([template()]);
    fireEvent.click(screen.getByText('Standup'));

    expect(name()).toHaveValue('Standup');
    expect(fieldLabels()).toEqual(['Done', 'Blockers']);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    fireEvent.change(name(), { target: { value: 'Changed' } });
    describeAs('Changed too');
    click('Cancel');
    expect(name()).toHaveValue('Standup');
    expect(screen.getByLabelText('Description')).toHaveValue('Daily notes');
  });

  it('opens a template without a description', () => {
    renderBuilder([template({ description: undefined })]);
    fireEvent.click(screen.getByText('Standup'));
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('saves moved, renamed and deleted fields in their new order', async () => {
    const { update } = renderBuilder([template()]);
    fireEvent.click(screen.getByText('Standup'));

    fireEvent.click(screen.getAllByRole('button', { name: 'Move Down' })[0]);
    expect(fieldLabels()).toEqual(['Blockers', 'Done']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Move Up' })[1]);
    expect(fieldLabels()).toEqual(['Done', 'Blockers']);
    fireEvent.change(screen.getAllByPlaceholderText('Field Label')[1], { target: { value: 'Stuck on' } });
    click('Add Field');
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Field' })[0]);
    click('Update Template');

    await waitFor(() =>
      expect(notifications.current.showSuccess).toHaveBeenCalledWith('Template saved', { category: 'template' })
    );
    expect(update).toHaveBeenCalledWith('t1', {
      name: 'Standup',
      description: 'Daily notes',
      fields: [
        expect.objectContaining({ id: 'f2', label: 'Stuck on', order: 0 }),
        expect.objectContaining({ label: 'New Field', order: 1 }),
      ],
      isActive: true,
    });
  });

  it('turns a template on and off', async () => {
    const { update } = renderBuilder([template(), template({ id: 't2', name: 'Retro', isActive: false })]);

    click('Deactivate Standup');
    await waitFor(() =>
      expect(notifications.current.showSuccess).toHaveBeenCalledWith('Template deactivated', { category: 'template' })
    );
    click('Activate Retro');
    await waitFor(() =>
      expect(notifications.current.showSuccess).toHaveBeenCalledWith('Template activated', { category: 'template' })
    );
    expect(update.mock.calls).toEqual([
      ['t1', { isActive: false }],
      ['t2', { isActive: true }],
    ]);

    update.mockRejectedValueOnce('locked');
    click('Deactivate Standup');
    await waitFor(() =>
      expect(notifications.current.showError).toHaveBeenCalledWith('locked', { category: 'template' })
    );
  });

  it('deletes a template once confirmed, closing it if it was open', async () => {
    const { remove } = renderBuilder([template()]);
    fireEvent.click(screen.getByText('Standup'));

    click('Delete Standup');
    click('Cancel');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(remove).not.toHaveBeenCalled();

    click('Delete Standup');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(notifications.current.showSuccess).toHaveBeenCalledWith('Template deleted', { category: 'template' })
    );
    expect(remove).toHaveBeenCalledWith('t1');
    expect(name()).toHaveValue('');
  });

  it('keeps another template open when deleting one, and says why a delete failed', async () => {
    const { remove } = renderBuilder([template(), template({ id: 't2', name: 'Retro' })]);
    fireEvent.click(screen.getByText('Retro'));

    click('Delete Standup');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(name()).toHaveValue('Retro');

    remove.mockRejectedValueOnce(new Error('in use'));
    click('Delete Retro');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(notifications.current.showError).toHaveBeenCalledWith('in use', { category: 'template' })
    );
  });
});
