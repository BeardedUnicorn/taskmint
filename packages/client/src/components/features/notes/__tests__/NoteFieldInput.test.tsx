import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NoteFieldInput } from '../NoteFieldInput';
import { TemplateField } from '../../../../types/notes';

const field = (type: TemplateField['type'], overrides: Partial<TemplateField> = {}): TemplateField => ({
  id: 'f',
  label: 'Field',
  type,
  required: false,
  order: 0,
  ...overrides,
});

describe('NoteFieldInput', () => {
  it('edits text, showing nothing for a missing value and the placeholder as a hint', () => {
    const onChange = vi.fn();
    render(<NoteFieldInput field={field('text', { placeholder: 'What happened' })} value={null} onChange={onChange} />);

    const input = screen.getByLabelText('Field');
    expect(input).toHaveValue('');
    expect(screen.getByText('What happened', { selector: 'p' })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Shipped it' } });
    expect(onChange).toHaveBeenCalledWith('f', 'Shipped it');
  });

  it('keeps a number as a number, and an emptied one as none', () => {
    const onChange = vi.fn();
    render(<NoteFieldInput field={field('number')} value={3} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Field'), { target: { value: '7.5' } });
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: '' } });
    expect(onChange.mock.calls).toEqual([
      ['f', 7.5],
      ['f', null],
    ]);
  });

  it('edits a date', () => {
    const onChange = vi.fn();
    render(<NoteFieldInput field={field('date')} value="2026-10-01" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Field'), { target: { value: '2026-10-02' } });
    expect(onChange).toHaveBeenCalledWith('f', '2026-10-02');
  });

  it('ticks a checkbox, with its error under it', () => {
    const onChange = vi.fn();
    const { rerender } = render(<NoteFieldInput field={field('checkbox')} value={undefined} onChange={onChange} />);
    expect(screen.queryByText('Required')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Field' }));
    expect(onChange).toHaveBeenCalledWith('f', true);

    rerender(<NoteFieldInput field={field('checkbox')} value={true} error="Required" onChange={onChange} />);
    expect(screen.getByRole('checkbox', { name: 'Field' })).toBeChecked();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('picks an option; an optional select offers None', async () => {
    const onChange = vi.fn();
    const options = [{ label: 'Done', value: 'done' }];
    const { unmount } = render(<NoteFieldInput field={field('select', { options })} value="" onChange={onChange} />);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Field' }));
    expect(await screen.findByRole('option', { name: 'None' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith('f', 'done');
    unmount();

    render(
      <NoteFieldInput
        field={field('select', { required: true, placeholder: 'Pick one' })}
        value=""
        onChange={onChange}
      />
    );
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Field/ }));
    expect(screen.queryByRole('option', { name: 'None' })).not.toBeInTheDocument();
  });
});
