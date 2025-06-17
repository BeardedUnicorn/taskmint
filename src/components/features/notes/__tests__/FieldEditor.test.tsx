/**
 * FieldEditor Unit Tests
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { FieldEditor } from '../FieldEditor';
import { TemplateField } from '../../../../types/notes';

describe('FieldEditor', () => {
  const mockField: TemplateField = {
    id: 'field1',
    label: 'Test Field',
    type: 'text',
    required: false,
    order: 0,
  };

  const mockOnUpdateField = jest.fn();
  const mockOnDeleteField = jest.fn();
  const mockOnMoveField = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders field with correct icons', () => {
    render(
      <FieldEditor
        field={mockField}
        onUpdateField={mockOnUpdateField}
        onDeleteField={mockOnDeleteField}
        onMoveField={mockOnMoveField}
        isFirst={false}
        isLast={false}
      />
    );

    // Check that the new icons are used
    expect(screen.getByTitle('Move Up')).toBeInTheDocument();
    expect(screen.getByTitle('Move Down')).toBeInTheDocument();
    expect(screen.getByTitle('Expand')).toBeInTheDocument();
    expect(screen.getByTitle('Delete Field')).toBeInTheDocument();
  });

  it('uses different icons for move up/down vs expand/collapse', () => {
    render(
      <FieldEditor
        field={mockField}
        onUpdateField={mockOnUpdateField}
        onDeleteField={mockOnDeleteField}
        onMoveField={mockOnMoveField}
        isFirst={false}
        isLast={false}
      />
    );

    const moveUpButton = screen.getByTitle('Move Up');
    const expandButton = screen.getByTitle('Expand');

    // Verify different icons are used by checking their SVG content
    const moveUpIcon = moveUpButton.querySelector('svg');
    const expandIcon = expandButton.querySelector('svg');

    expect(moveUpIcon).not.toEqual(expandIcon);
  });

  it('calls onMoveField when move buttons are clicked', () => {
    render(
      <FieldEditor
        field={mockField}
        onUpdateField={mockOnUpdateField}
        onDeleteField={mockOnDeleteField}
        onMoveField={mockOnMoveField}
        isFirst={false}
        isLast={false}
      />
    );

    fireEvent.click(screen.getByTitle('Move Up'));
    expect(mockOnMoveField).toHaveBeenCalledWith('field1', 'up');

    fireEvent.click(screen.getByTitle('Move Down'));
    expect(mockOnMoveField).toHaveBeenCalledWith('field1', 'down');
  });

  it('disables move up button when isFirst is true', () => {
    render(
      <FieldEditor
        field={mockField}
        onUpdateField={mockOnUpdateField}
        onDeleteField={mockOnDeleteField}
        onMoveField={mockOnMoveField}
        isFirst={true}
        isLast={false}
      />
    );

    expect(screen.getByTitle('Move Up')).toBeDisabled();
    expect(screen.getByTitle('Move Down')).not.toBeDisabled();
  });

  it('disables move down button when isLast is true', () => {
    render(
      <FieldEditor
        field={mockField}
        onUpdateField={mockOnUpdateField}
        onDeleteField={mockOnDeleteField}
        onMoveField={mockOnMoveField}
        isFirst={false}
        isLast={true}
      />
    );

    expect(screen.getByTitle('Move Up')).not.toBeDisabled();
    expect(screen.getByTitle('Move Down')).toBeDisabled();
  });

  it('expands and collapses field configuration', () => {
    render(
      <FieldEditor
        field={mockField}
        onUpdateField={mockOnUpdateField}
        onDeleteField={mockOnDeleteField}
        onMoveField={mockOnMoveField}
        isFirst={false}
        isLast={false}
      />
    );

    // Initially collapsed
    expect(screen.queryByText('Field Type')).not.toBeInTheDocument();

    // Expand
    fireEvent.click(screen.getByTitle('Expand'));
    expect(screen.getByText('Field Type')).toBeInTheDocument();
    expect(screen.getByTitle('Collapse')).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByTitle('Collapse'));
    expect(screen.queryByText('Field Type')).not.toBeInTheDocument();
  });

  it('calls onDeleteField when delete button is clicked', () => {
    render(
      <FieldEditor
        field={mockField}
        onUpdateField={mockOnUpdateField}
        onDeleteField={mockOnDeleteField}
        onMoveField={mockOnMoveField}
        isFirst={false}
        isLast={false}
      />
    );

    fireEvent.click(screen.getByTitle('Delete Field'));
    expect(mockOnDeleteField).toHaveBeenCalledWith('field1');
  });

  it('updates field label when input changes', () => {
    render(
      <FieldEditor
        field={mockField}
        onUpdateField={mockOnUpdateField}
        onDeleteField={mockOnDeleteField}
        onMoveField={mockOnMoveField}
        isFirst={false}
        isLast={false}
      />
    );

    const labelInput = screen.getByDisplayValue('Test Field');
    fireEvent.change(labelInput, { target: { value: 'Updated Field' } });

    expect(mockOnUpdateField).toHaveBeenCalledWith({
      ...mockField,
      label: 'Updated Field',
    });
  });
});
