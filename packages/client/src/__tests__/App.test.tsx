/**
 * The whole app on the real providers, against a fake backend: the sidebar
 * opens every page, and the app-wide actions (start work, add time) open
 * their dialogs, or the Tasks page when there's nothing to start.
 */

import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, onTestFinished } from 'vitest';
import App from '../App';
import { AppExtensionsProvider } from '../app/extensions';
import { useNotification } from '../contexts/NotificationContext';
import { announceAppRecordsChange, fakeBackend, seedAppRecords } from '../testing';
import { VIEW_LABELS, VIEWS } from '../navigation/views';
import { createMockTask, createMockTaskSession, createMockTimerInstance } from './setup/session-test-utils';
import { setPhoneViewport } from './setup/viewport';

let replies: Record<string, unknown>;
const defaults = {
  get_sessions: [],
  get_work_logs: { entries: [], mappings: [], loadWarning: null },
  get_session_load_warning: null,
  take_pending_work_log_capture: null,
};

const annotation = createMockTask({ id: 'task-1', name: 'Annotation' });
/** Annotation's active session, its timer running, with an hour logged before. */
const running = createMockTaskSession({
  id: 's1',
  taskId: 'task-1',
  taskName: 'Annotation',
  isActive: true,
  timerInstances: [
    createMockTimerInstance({ id: 'i1', sessionId: 's1', isRunning: true }),
    createMockTimerInstance({ id: 'i0', sessionId: 's1', duration: 3_600_000, endTime: '2024-01-15T11:00:00Z' }),
  ],
});

beforeEach(() => {
  replies = { ...defaults };
  window.localStorage.clear();
  seedAppRecords({ predefinedTasks: [annotation] });
  fakeBackend().call.mockImplementation(async (command: string) => replies[command] ?? null);
});

const calls = (command: string) => fakeBackend().call.mock.calls.filter(([name]) => name === command);
const heading = (view: (typeof VIEWS)[number]) => screen.findByRole('heading', { name: VIEW_LABELS[view], level: 1 });
const nav = (view: (typeof VIEWS)[number]) => fireEvent.click(screen.getByRole('button', { name: VIEW_LABELS[view] }));

describe('App', () => {
  it("runs the shell's background work inside the app's providers", async () => {
    function Background() {
      const { showInfo } = useNotification();
      return (
        <button type="button" onClick={() => showInfo('From the shell')}>
          Shell work
        </button>
      );
    }
    render(
      <AppExtensionsProvider value={{ Background }}>
        <App />
      </AppExtensionsProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Shell work' }));
    expect(await screen.findByText('From the shell')).toBeInTheDocument();
  });

  it("keeps a phone's launch screen up until the page and the session list are on screen", async () => {
    let sessionsArrive!: (sessions: unknown[]) => void;
    replies.get_sessions = new Promise(resolve => {
      sessionsArrive = resolve;
    });
    const { hide } = fakeBackend().platform.splashScreen;
    const pageShown: boolean[] = [];
    hide.mockImplementation(() => {
      pageShown.push(screen.queryByRole('heading', { name: VIEW_LABELS.home, level: 1 }) !== null);
    });
    onTestFinished(() => {
      hide.mockReset();
    });

    render(<App />);
    // The page's own skeleton, while the sessions load: still covered
    expect(await screen.findByLabelText('Loading')).toBeInTheDocument();
    await act(() => new Promise(resolve => setTimeout(resolve, 100)));
    expect(hide).not.toHaveBeenCalled();

    await act(async () => sessionsArrive([]));
    await heading('home');
    await waitFor(() => expect(pageShown).toHaveLength(1));
    expect(pageShown[0]).toBe(true);
  });

  it('opens every page from the sidebar', async () => {
    render(<App />);
    for (const view of VIEWS) {
      nav(view);
      // (Pages load lazily, which can take a while when the machine is busy)
      expect(
        await screen.findByRole('heading', { name: VIEW_LABELS[view], level: 1 }, { timeout: 5000 })
      ).toBeInTheDocument();
    }
  }, 30_000);

  it('on a phone, swaps the sidebar for a top bar whose menu opens each page, and tabs for the main ones', async () => {
    setPhoneViewport();
    render(<App />);

    // No sidebar to collapse; the bell sits in the top bar with the page's name
    expect(await screen.findByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tasks' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Notifications/ })).toBeInTheDocument();
    expect(screen.getByText('Home', { selector: '.MuiToolbar-root *' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tasks' }));

    // The menu closes on the way, and the bar names the new page
    expect(await heading('tasks')).toBeInTheDocument();
    expect(screen.getByText('Tasks', { selector: '.MuiToolbar-root *' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument());

    // The tabs along the bottom open the main pages without the menu
    const tabs = within(screen.getByRole('navigation', { name: 'Pages' }));
    fireEvent.click(tabs.getByRole('button', { name: 'Payouts' }));
    expect(await screen.findByRole('heading', { name: 'Payouts', level: 1 }, { timeout: 5000 })).toBeInTheDocument();
    expect(tabs.getByRole('button', { name: 'Payouts' })).toHaveAttribute('aria-current', 'page');
  }, 15_000);

  it('opens on Home, and starts each page opened at the top', async () => {
    render(<App />);
    expect(await heading('home')).toBeInTheDocument();
    const scroller = screen.getByRole('main');

    nav('history');
    await heading('history');
    scroller.scrollTop = 400;
    nav('payouts');
    expect(await heading('payouts')).toBeInTheDocument();
    expect(scroller.scrollTop).toBe(0);

    // Opening the page already showing goes back to its top too
    scroller.scrollTop = 250;
    nav('payouts');
    await waitFor(() => expect(scroller.scrollTop).toBe(0));
  });

  it('starts work from the dialog the Sessions page opens', async () => {
    render(<App />);
    nav('sessions');
    fireEvent.click(await screen.findByRole('button', { name: 'Start a session' }));

    const dialog = await screen.findByRole('dialog', { name: 'Start Work' });
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: /^Task/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Annotation/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start' }));

    await waitFor(() =>
      expect(calls('start_task')).toEqual([['start_task', { taskId: 'task-1', taskName: 'Annotation' }]])
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sends work to the Tasks page when no task can be started, even mid-choice', async () => {
    render(<App />);
    nav('sessions');
    fireEvent.click(await screen.findByRole('button', { name: 'Start a session' }));
    await screen.findByRole('dialog', { name: 'Start Work' });

    // Archived on another device while choosing
    seedAppRecords({ predefinedTasks: [{ ...annotation, isArchived: true }] });
    act(() => announceAppRecordsChange({ keys: ['predefinedTasks'], conflict: false }));
    fireEvent.click(await screen.findByRole('button', { name: 'Go to Tasks' }));
    expect(await heading('tasks')).toBeInTheDocument();

    nav('sessions');
    fireEvent.click(await screen.findByRole('button', { name: 'Start a session' }));
    expect(await heading('tasks')).toBeInTheDocument();
  });

  it('adds time from the dialog the Sessions page opens', async () => {
    render(<App />);
    nav('sessions');
    fireEvent.click(await screen.findByRole('button', { name: 'Add time' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Time' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the running task as running on Tasks and Notes, and opens its History', async () => {
    replies.get_sessions = [running];
    render(<App />);
    nav('tasks');
    await heading('tasks');

    expect(await screen.findByRole('button', { name: 'Running' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /View all in History/ }));
    expect(await heading('history')).toBeInTheDocument();

    nav('notes');
    expect(await screen.findByText(/Active Timer:/)).toBeInTheDocument();
  });

  it('starts a task from the Tasks page', async () => {
    render(<App />);
    nav('tasks');
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));

    await waitFor(() => expect(calls('start_task')).toHaveLength(1));
  });

  it('saves an entry edited on the Tasks page', async () => {
    replies.get_sessions = [running];
    render(<App />);
    nav('tasks');
    const [edit] = await screen.findAllByRole('button', { name: 'Edit Entry' });
    fireEvent.click(edit);

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Hours'), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls('update_timer_instance')).toHaveLength(1));
  });
});
