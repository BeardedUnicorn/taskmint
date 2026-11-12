import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BottomNavBar } from '../BottomNavBar';

describe('BottomNavBar', () => {
  it('has tabs for Home, Sessions, Calendar and Payouts, the page showing marked', () => {
    render(<BottomNavBar activeView="calendar" onViewChange={() => {}} />);

    const bar = within(screen.getByRole('navigation', { name: 'Pages' }));
    expect(bar.getAllByRole('button').map(tab => tab.textContent)).toEqual(['Home', 'Sessions', 'Calendar', 'Payouts']);
    expect(bar.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
    expect(bar.getByRole('button', { name: 'Calendar' })).toHaveClass('Mui-selected');
    expect(bar.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('lights no tab for a page reached from the menu', () => {
    render(<BottomNavBar activeView="tasks" onViewChange={() => {}} />);
    expect(screen.queryByRole('button', { current: 'page' })).not.toBeInTheDocument();
    expect(document.querySelector('.Mui-selected')).toBeNull();
  });

  it('opens the tapped page, the one showing too (so it goes back to its top)', () => {
    const onViewChange = vi.fn();
    render(<BottomNavBar activeView="home" onViewChange={onViewChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Payouts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(onViewChange.mock.calls).toEqual([['payouts'], ['home']]);
  });
});
