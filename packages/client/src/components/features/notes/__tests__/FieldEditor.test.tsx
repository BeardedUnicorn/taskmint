/**
 * FieldEditor: a template field's settings, each change sent back whole to
 * the builder that holds the field.
 */

import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FieldEditor } from '../FieldEditor';
import { TemplateField } from '../../../../types/notes';

const textField: TemplateField = { id: 'field1', label: 'Test Field', type: 'text', required: false, order: 0 };

/** The editor under a parent that keeps each change, as the builder does. */
function renderEditor(initial: Partial<TemplateField> = {}, place = { isFirst: false, isLast: false }) {
  const changes = vi.fn();
  const onDeleteField = vi.fn();
  const onMoveField = vi.fn();
  function Parent() {
    const [field, setField] = useState<TemplateField>({ ...textField, ...initial });
    return (
      <FieldEditor
        field={field}
        onUpdateField={next => {
          changes(next);
          setField(next);
        }}
        onDeleteField={onDeleteField}
        onMoveField={onMoveField}
        {...place}
      />
    );
  }
  render(<Parent />);
  const latest = (): TemplateField => changes.mock.calls.at(-1)![0];
  return { changes, latest, onDeleteField, onMoveField };
}

const expand = () => fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function chooseType(name: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Field Type' }));
  fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name }));
}

describe('FieldEditor', () => {
  it('moves, deletes and renames the field', () => {
    const { latest, onDeleteField, onMoveField } = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Move Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Field' }));
    fireEvent.change(screen.getByPlaceholderText('Field Label'), { target: { value: 'Summary' } });

    expect(onMoveField.mock.calls).toEqual([
      ['field1', 'up'],
      ['field1', 'down'],
    ]);
    expect(onDeleteField).toHaveBeenCalledWith('field1');
    expect(latest()).toEqual({ ...textField, label: 'Summary' });
  });

  it("can't move the first field up, nor the last down", () => {
    renderEditor({}, { isFirst: true, isLast: true });
    expect(screen.getByRole('button', { name: 'Move Up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Down' })).toBeDisabled();
  });

  it('opens and closes the settings', () => {
    renderEditor();
    expect(screen.queryByTestId('field-config')).not.toBeInTheDocument();

    expand();
    expect(screen.getByTestId('field-config')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks a required field, and keeps a placeholder only when there is one', () => {
    const { latest } = renderEditor();
    expand();

    fireEvent.click(screen.getByRole('switch', { name: 'Required' }));
    expect(latest().required).toBe(true);
    expect(screen.getAllByText('*').length).toBeGreaterThan(0);

    type('Placeholder Text', 'What happened?');
    expect(latest().placeholder).toBe('What happened?');
    type('Placeholder Text', '');
    expect(latest().placeholder).toBeUndefined();
  });

  it('keeps text limits as whole numbers and a pattern, dropping what is cleared', () => {
    const { latest } = renderEditor();
    expand();

    type('Min Length', '0');
    type('Max Length', '12.7');
    type('Pattern (Regex)', '^[a-z]+$');
    expect(latest().validation).toEqual({ min: 0, max: 12, pattern: '^[a-z]+$' });
    // A limit of 0 still shows
    expect(screen.getByLabelText('Min Length')).toHaveValue(0);

    type('Min Length', '');
    type('Max Length', '');
    type('Pattern (Regex)', '');
    expect(latest().validation).toBeUndefined();
  });

  it('keeps number limits as decimals', async () => {
    const { latest } = renderEditor();
    expand();
    await chooseType('Number');

    type('Minimum Value', '1.5');
    type('Maximum Value', '9.25');
    expect(latest()).toMatchObject({ type: 'number', validation: { min: 1.5, max: 9.25 } });

    type('Minimum Value', '');
    type('Maximum Value', '');
    expect(latest().validation).toBeUndefined();
  });

  it('starts a select field with one option, and edits its options', async () => {
    const { latest } = renderEditor({ validation: { min: 2 } });
    expand();
    await chooseType('Select');

    expect(latest()).toMatchObject({
      type: 'select',
      validation: undefined,
      options: [{ label: 'Option 1', value: 'option1' }],
    });
    expect(screen.getByRole('button', { name: 'Remove option' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Option' }));
    const [, secondLabel] = screen.getAllByLabelText('Label');
    const [firstValue] = screen.getAllByLabelText('Value');
    fireEvent.change(secondLabel, { target: { value: 'Blocked' } });
    fireEvent.change(firstValue, { target: { value: 'done' } });
    expect(latest().options).toEqual([
      { label: 'Option 1', value: 'done' },
      { label: 'Blocked', value: 'option2' },
    ]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove option' })[0]);
    expect(latest().options).toEqual([{ label: 'Blocked', value: 'option2' }]);
  });

  it('edits a stored select field that has no options yet', () => {
    const { latest } = renderEditor({ type: 'select' });
    expand();

    fireEvent.click(screen.getByRole('button', { name: 'Add Option' }));
    expect(latest().options).toEqual([{ label: 'Option 1', value: 'option1' }]);
  });

  it.each([
    ['Date', 'date', () => expect(document.querySelector('input[type="date"]')).toBeDisabled()],
    ['Checkbox', 'checkbox', () => expect(screen.getAllByRole('checkbox').at(-1)).toBeDisabled()],
    ['Number', 'number', () => expect(document.querySelector('input[type="number"][disabled]')).not.toBeNull()],
    ['Text', 'text', () => expect(document.querySelector('textarea[disabled]')).not.toBeNull()],
  ])('previews a %s field', async (name, value, check) => {
    const { latest } = renderEditor({ type: value === 'text' ? 'number' : 'text' });
    expand();
    await chooseType(name);

    expect(latest()).toMatchObject({ type: value, options: undefined, validation: undefined });
    check();
  });
});
