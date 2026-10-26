/**
 * FieldEditor Unit Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FieldEditor } from '../FieldEditor';
import { TemplateField } from '../../../../types/notes';

describe('FieldEditor', () => {

  // Replace Collapse with our mock
  
  const mockField: TemplateField = {
    id: 'field1',
    label: 'Test Field',
    type: 'text',
    required: false,
    order: 0,
  };

  const mockOnUpdateField = vi.fn();
  const mockOnDeleteField = vi.fn();
  const mockOnMoveField = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByRole('button', { name: 'Move Up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Field' })).toBeInTheDocument();
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

    const moveUpButton = screen.getByRole('button', { name: 'Move Up' });
    const expandButton = screen.getByRole('button', { name: 'Expand' });

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

    fireEvent.click(screen.getByRole('button', { name: 'Move Up' }));
    expect(mockOnMoveField).toHaveBeenCalledWith('field1', 'up');

    fireEvent.click(screen.getByRole('button', { name: 'Move Down' }));
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

    expect(screen.getByRole('button', { name: 'Move Up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Down' })).not.toBeDisabled();
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

    expect(screen.getByRole('button', { name: 'Move Up' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Down' })).toBeDisabled();
  });

  it('expands and collapses field configuration', async () => {
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

    // Initially collapsed - field config should not be visible
    expect(screen.queryByTestId('field-config')).not.toBeInTheDocument();

    // Find and click the expand button (should have "Expand" title)
    const expandButton = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandButton);

    // After expanding, field config should be visible
    await waitFor(() => {
      expect(screen.getByTestId('field-config')).toBeInTheDocument();
    });

    // The button should now have "Collapse" title
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();

    // Click collapse button
    const collapseButton = screen.getByRole('button', { name: 'Collapse' });
    fireEvent.click(collapseButton);

    // After collapsing, field config should not be visible
    await waitFor(() => {
      expect(screen.queryByTestId('field-config')).not.toBeInTheDocument();
    });
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

    fireEvent.click(screen.getByRole('button', { name: 'Delete Field' }));
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
