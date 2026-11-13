import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Button, Dialog, DialogTitle, Menu, MenuItem } from '@mui/material';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { NavigationProvider, useNavigation } from '../../contexts/NavigationContext';
import { useBackButton, useBackStep } from '../backButton';

/** A shell like the app's: the page's name, a dialog, a menu, and a page with its own step back. */
function Shell() {
  useBackButton();
  const { view, navigate } = useNavigation();
  const [dialog, setDialog] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [detail, setDetail] = useState(false);
  useBackStep(detail, () => setDetail(false));
  return (
    <>
      <p>Page: {view}</p>
      <p>{detail ? 'A task' : 'The list'}</p>
      <Button onClick={() => navigate('tasks')}>Tasks</Button>
      <Button onClick={() => setDetail(true)}>Open a task</Button>
      <Button onClick={() => setDialog(true)}>Open dialog</Button>
      <Button onClick={event => setMenuAnchor(event.currentTarget)}>Open menu</Button>
      <Dialog open={dialog} onClose={() => setDialog(false)}>
        <DialogTitle>A dialog</DialogTitle>
      </Dialog>
      <Menu open={Boolean(menuAnchor)} anchorEl={menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem>An item</MenuItem>
      </Menu>
    </>
  );
}

function renderShell() {
  const view = render(
    <NavigationProvider>
      <Shell />
    </NavigationProvider>
  );
  return view;
}

const pressBack = () => act(() => fakeBackend().pressBack());

describe('Android back', () => {
  it('closes the dialog or menu opened last, then steps back on the page, then goes Home, then leaves', async () => {
    const backend = fakeBackend();
    backend.platform.backButton.leaveApp.mockClear();
    renderShell();
    await waitFor(() => expect(backend.platform.backButton.listen).toHaveBeenCalled());

    act(() => screen.getByRole('button', { name: 'Tasks' }).click());
    act(() => screen.getByRole('button', { name: 'Open a task' }).click());
    act(() => screen.getByRole('button', { name: 'Open dialog' }).click());
    expect(screen.getByRole('dialog', { name: 'A dialog' })).toBeInTheDocument();

    pressBack();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Page: tasks')).toBeInTheDocument();
    expect(screen.getByText('A task')).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Open menu' }).click());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    pressBack();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    pressBack();
    expect(screen.getByText('The list')).toBeInTheDocument();
    expect(screen.getByText('Page: tasks')).toBeInTheDocument();

    pressBack();
    expect(screen.getByText('Page: home')).toBeInTheDocument();
    expect(backend.platform.backButton.leaveApp).not.toHaveBeenCalled();

    pressBack();
    expect(backend.platform.backButton.leaveApp).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the shell goes', async () => {
    const backend = fakeBackend();
    backend.platform.backButton.leaveApp.mockClear();
    const { unmount } = renderShell();
    await waitFor(() => expect(backend.platform.backButton.listen).toHaveBeenCalled());
    unmount();
    backend.pressBack();
    expect(backend.platform.backButton.leaveApp).not.toHaveBeenCalled();
  });

  it('stops listening even when the shell goes before listening has started', async () => {
    const backend = fakeBackend();
    backend.platform.backButton.leaveApp.mockClear();
    const { unmount } = renderShell();
    unmount();
    await act(async () => {});
    backend.pressBack();
    expect(backend.platform.backButton.leaveApp).not.toHaveBeenCalled();
  });

  it('does nothing where there is no back button', () => {
    installFakeBackendForTest({ without: ['backButton'] });
    renderShell();
    expect(screen.getByText('Page: home')).toBeInTheDocument();
  });
});
