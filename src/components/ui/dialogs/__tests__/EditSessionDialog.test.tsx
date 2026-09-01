/**
 * Unit Tests for EditSessionDialog Component
 *
 * Covers the notes editing flow, the formatted session date, and the
 * in-app discard confirmation (which replaced window.confirm).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { EditSessionDialog } from '../EditSessionDialog';
import { TaskSession } from '../../../../types/timer';

describe('EditSessionDialog', () => {
  const mockSession: TaskSession = {
    id: 'session-1',
    taskId: 'task-1',
    taskName: 'Development Work',
    timerInstances: [],
    totalDuration: 0,
    isActive: false,
    date: '2024-01-15',
    notes: 'Original notes',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockProps = {
    open: true,
    session: mockSession,
    onClose: vi.fn(),
    onSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the session name and a formatted local date', () => {
    render(<EditSessionDialog {...mockProps} />);

    expect(screen.getByText('Development Work')).toBeInTheDocument();
    // The raw "2024-01-15" string is formatted as a local calendar day
    expect(screen.getByText(/Monday, January 15, 2024/)).toBeInTheDocument();
    expect(screen.queryByText(/Session Date: 2024-01-15/)).not.toBeInTheDocument();
  });

  it('saves trimmed notes and closes', () => {
    render(<EditSessionDialog {...mockProps} />);

    fireEvent.change(screen.getByLabelText('Session Notes'), {
      target: { value: '  Updated notes  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Notes' }));

    expect(mockProps.onSave).toHaveBeenCalledWith('session-1', { notes: 'Updated notes' });
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('closes directly when nothing changed', () => {
    render(<EditSessionDialog {...mockProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockProps.onClose).toHaveBeenCalled();
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  it('asks for confirmation before discarding edits', () => {
    render(<EditSessionDialog {...mockProps} />);

    fireEvent.change(screen.getByLabelText('Session Notes'), {
      target: { value: 'Edited but not saved' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // The dialog stays open behind an in-app confirmation
    expect(mockProps.onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
  });

  it('keeps editing when the confirmation is declined', () => {
    render(<EditSessionDialog {...mockProps} />);

    fireEvent.change(screen.getByLabelText('Session Notes'), {
      target: { value: 'Edited but not saved' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(mockProps.onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Session Notes')).toHaveValue('Edited but not saved');
  });

  it('discards edits when the confirmation is accepted', () => {
    render(<EditSessionDialog {...mockProps} />);

    fireEvent.change(screen.getByLabelText('Session Notes'), {
      target: { value: 'Edited but not saved' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(mockProps.onClose).toHaveBeenCalled();
    expect(mockProps.onSave).not.toHaveBeenCalled();
  });
});
