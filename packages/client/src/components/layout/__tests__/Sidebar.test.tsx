import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sidebar } from '../Sidebar';

beforeEach(() => {
  localStorage.clear();
});

describe('Sidebar', () => {
  it('opens a page from its button, and marks the one showing', () => {
    const onViewChange = vi.fn();
    render(<Sidebar activeView="history" onViewChange={onViewChange} />);

    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(onViewChange).toHaveBeenCalledWith('tasks');
  });

  it('collapses to icons, its extras told so, and stays collapsed next time', () => {
    const footer = vi.fn((collapsed: boolean) => <span>{collapsed ? 'small footer' : 'footer'}</span>);
    const headerAction = vi.fn((collapsed: boolean) => <span>{collapsed ? 'small bell' : 'bell'}</span>);
    const { unmount } = render(
      <Sidebar activeView="sessions" onViewChange={() => {}} footer={footer} headerAction={headerAction} />
    );
    expect(screen.getByRole('img', { name: 'TaskMint' })).toBeInTheDocument();
    expect(screen.getByText('bell')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.queryByRole('img', { name: 'TaskMint' })).not.toBeInTheDocument();
    expect(screen.getByText('small bell')).toBeInTheDocument();
    expect(screen.getByText('small footer')).toBeInTheDocument();
    unmount();

    render(<Sidebar activeView="sessions" onViewChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('img', { name: 'TaskMint' })).toBeInTheDocument();
  });
});
