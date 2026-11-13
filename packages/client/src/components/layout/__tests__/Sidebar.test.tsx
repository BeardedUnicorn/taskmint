import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EDGE_SWIPE, EDGE_SWIPE_CLASS, Sidebar } from '../Sidebar';
import { fakeBackend, installFakeBackendForTest } from '../../../testing';

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

  it("slides in as a phone's menu: always expanded, no shortcuts, closed by picking a page", () => {
    // Collapsed on the desktop: a phone's menu shows its labels anyway
    localStorage.setItem('sidebarCollapsed', 'true');
    const onViewChange = vi.fn();
    const onClose = vi.fn();
    const footer = vi.fn((collapsed: boolean) => <span>{collapsed ? 'ring' : 'bar'}</span>);
    render(
      <Sidebar
        variant="temporary"
        open
        onOpen={vi.fn()}
        onClose={onClose}
        activeView="sessions"
        onViewChange={onViewChange}
        footer={footer}
      />
    );

    expect(screen.getByRole('img', { name: 'TaskMint' })).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sidebar/ })).not.toBeInTheDocument();
    // Its items carry no shortcut hints
    expect(screen.getByRole('button', { name: 'Payouts' })).not.toHaveAccessibleDescription();

    fireEvent.click(screen.getByRole('button', { name: 'Payouts' }));
    expect(onViewChange).toHaveBeenCalledWith('payouts');
    expect(onClose).toHaveBeenCalled();
  });

  it("tells the phone where a swipe in from the edge opens it, as that moves, until it's gone", async () => {
    installFakeBackendForTest({});
    const { setArea } = fakeBackend().platform.edgeSwipe;
    const { unmount } = render(
      <Sidebar
        variant="temporary"
        open={false}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        activeView="home"
        onViewChange={vi.fn()}
      />
    );
    // The band at the left edge, above the bottom tabs (told once it's there)
    await waitFor(() => expect(setArea).toHaveBeenCalledTimes(1));
    expect(setArea).toHaveBeenLastCalledWith({ left: 0, top: 0, width: 0, height: 0 });
    const band = document.querySelector<HTMLElement>(`.${EDGE_SWIPE_CLASS}`)!;
    expect(band.style.height).toBe(`${EDGE_SWIPE.height}px`);
    expect(band.style.top).toBe('auto');

    act(() => window.dispatchEvent(new Event('resize')));
    act(() => fakeBackend().changeInsets());
    expect(setArea).toHaveBeenCalledTimes(3);

    unmount();
    expect(setArea).toHaveBeenLastCalledWith(null);
  });

  it("leaves the edge alone on a desktop's sidebar, or with no band to say", () => {
    installFakeBackendForTest({});
    render(<Sidebar activeView="home" onViewChange={vi.fn()} />);
    expect(fakeBackend().platform.edgeSwipe.setArea).not.toHaveBeenCalled();

    installFakeBackendForTest({ without: ['edgeSwipe'] });
    expect(() =>
      render(
        <Sidebar
          variant="temporary"
          open={false}
          onOpen={vi.fn()}
          onClose={vi.fn()}
          activeView="home"
          onViewChange={vi.fn()}
        />
      )
    ).not.toThrow();
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
