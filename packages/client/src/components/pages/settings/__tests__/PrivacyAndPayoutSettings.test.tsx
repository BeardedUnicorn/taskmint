import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PrivacySettingsSection } from '../PrivacySettingsSection';
import { PayoutSettingsSection } from '../PayoutSettingsSection';
import { setErrorReportingEnabled } from '../../../../utils/sentry';
import { fakeBackend, installFakeBackendForTest } from '../../../../testing';

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

  it('turns usage statistics off and on where the shell has them', () => {
    localStorage.clear();
    const backend = fakeBackend();
    render(<PrivacySettingsSection />);
    const toggle = screen.getByRole('switch', { name: 'Share usage statistics' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(backend.platform.analytics.setEnabled).toHaveBeenLastCalledWith(false);
    expect(localStorage.getItem('analyticsEnabled')).toBe('false');
    fireEvent.click(toggle);
    expect(backend.platform.analytics.setEnabled).toHaveBeenLastCalledWith(true);
  });

  it('has no usage statistics where the shell has none', () => {
    installFakeBackendForTest({ without: ['analytics'] });
    render(<PrivacySettingsSection />);
    expect(screen.queryByRole('switch', { name: 'Share usage statistics' })).not.toBeInTheDocument();
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
