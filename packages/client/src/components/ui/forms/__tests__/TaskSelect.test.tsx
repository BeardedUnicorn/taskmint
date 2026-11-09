import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { TaskSelect } from '../TaskSelect';
import { createMockTask } from '../../../../__tests__/setup/session-test-utils';

const tasks = [
  createMockTask({ id: 'r', name: 'Review', isFavorite: true }),
  createMockTask({ id: 'a', name: 'Annotation', hourlyRate: 40 }),
  createMockTask({ id: 'z', name: 'Zebra', hourlyRate: 0 }),
];

// Named by its label, then the task it shows
const field = () => screen.getByRole('combobox', { name: /^Task/ });

describe('TaskSelect', () => {
  it('lists the tasks in the order given, starring favorites, with a rate where there is one', () => {
    render(<TaskSelect tasks={tasks} value="" onChange={vi.fn()} />);
    fireEvent.mouseDown(field());

    const options = screen.getAllByRole('option').map(option => option.textContent);
    expect(options).toEqual(['★Review', 'Annotation$40.00/hr', 'Zebra']);
  });

  it('shows the picked task by name alone', () => {
    const { rerender } = render(<TaskSelect tasks={tasks} value="a" onChange={vi.fn()} />);
    expect(field()).toHaveTextContent(/^Annotation$/);

    rerender(<TaskSelect tasks={tasks} value="r" onChange={vi.fn()} />);
    expect(field()).toHaveTextContent(/^★Review$/);
  });

  it('reports the task picked', () => {
    const onChange = vi.fn();
    render(<TaskSelect tasks={tasks} value="" onChange={onChange} />);

    fireEvent.mouseDown(field());
    fireEvent.click(screen.getByRole('option', { name: /Annotation/ }));

    expect(onChange).toHaveBeenCalledWith(tasks[1]);
  });

  it('shows nothing, without a warning, for a task that is not listed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<TaskSelect tasks={tasks} value="gone" onChange={vi.fn()} />);

    expect(field()).not.toHaveTextContent(/\w/);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('takes no typing: there is no text box', () => {
    render(<TaskSelect tasks={tasks} value="" onChange={vi.fn()} />);

    expect(field()).toHaveAttribute('role', 'combobox');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('can be disabled, labeled, and show an error with help', () => {
    render(
      <TaskSelect tasks={[]} value="" onChange={vi.fn()} label="Pick one" disabled error helperText="Choose a task" />
    );

    expect(screen.getByRole('combobox', { name: 'Pick one' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Choose a task')).toHaveClass('Mui-error');
  });
});
