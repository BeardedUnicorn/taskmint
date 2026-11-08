import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PrivacySettingsSection } from '../PrivacySettingsSection';
import { PayoutSettingsSection } from '../PayoutSettingsSection';
import { setErrorReportingEnabled } from '../../../../utils/sentry';

vi.mock('../../../../utils/sentry', () => ({
  isErrorReportingEnabled: () => true,
  setErrorReportingEnabled: vi.fn(async () => {}),
}));

describe('PrivacySettingsSection', () => {
  it('turns error reports off', () => {
    render(<PrivacySettingsSection />);
    const toggle = screen.getByRole('switch', { name: 'Send error reports' });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(setErrorReportingEnabled).toHaveBeenCalledWith(false);
  });
});

describe('PayoutSettingsSection', () => {
  it('saves how many days funds are held', async () => {
    localStorage.clear();
    render(<PayoutSettingsSection />);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Days Before Funds Released' }));
    fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: '5' }));
    expect(screen.getByRole('combobox', { name: 'Days Before Funds Released' })).toHaveTextContent('5');
  });

  it('saves how many days the site makes you wait between withdrawals', async () => {
    localStorage.clear();
    render(<PayoutSettingsSection />);
    const interval = () => screen.getByRole('combobox', { name: 'Days Between Withdrawals' });
    expect(interval()).toHaveTextContent('3');

    fireEvent.mouseDown(interval());
    fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: '7' }));
    expect(interval()).toHaveTextContent('7');
  });
});
