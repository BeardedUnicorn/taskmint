/**
 * The Note Templates page on the real templates provider and records: it
 * waits for the load, says when it failed, and keeps the open template the
 * one as saved now.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NoteTemplates } from '../NoteTemplates';
import { NoteTemplatesProvider } from '../../../contexts/NoteTemplatesContext';
import { NoteTemplateService } from '../../../services/NoteTemplateService';
import { seedAppRecords } from '../../../testing';
import { createNotificationMock } from '../../../__tests__/setup/notificationMock';

vi.mock('../../../contexts/NotificationContext', () => ({ useNotification: () => createNotificationMock() }));

const standup = {
  id: 't1',
  name: 'Standup',
  fields: [],
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const page = () =>
  render(
    <NoteTemplatesProvider>
      <NoteTemplates />
    </NoteTemplatesProvider>
  );

beforeEach(() => {
  seedAppRecords({ noteTemplates: [standup] });
});

describe('NoteTemplates page', () => {
  it('shows progress until the templates are loaded', async () => {
    page();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(await screen.findByText('Standup')).toBeInTheDocument();
  });

  it('says when the templates could not be loaded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(NoteTemplateService.prototype, 'getAllTemplates').mockRejectedValueOnce(new Error('unreadable'));
    page();

    expect(await screen.findByRole('alert')).toHaveTextContent('unreadable');
    error.mockRestore();
  });

  it('keeps the open template the one as saved', async () => {
    page();
    fireEvent.click(await screen.findByText('Standup'));
    fireEvent.change(screen.getByRole('textbox', { name: /Template Name/ }), { target: { value: 'Daily standup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Template' }));

    await waitFor(() => expect(screen.getAllByText('Daily standup').length).toBeGreaterThan(0));
    // Still open, as saved: Cancel has nothing to put back
    expect(screen.getByRole('textbox', { name: /Template Name/ })).toHaveValue('Daily standup');
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New Template' }));
    expect(screen.getByRole('textbox', { name: /Template Name/ })).toHaveValue('');
  });
});
