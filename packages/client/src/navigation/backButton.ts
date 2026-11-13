/**
 * Android's back gesture and button. Each press does the first of:
 *
 * 1. closes the topmost dialog, menu, picker or the navigation drawer (all
 *    MUI modals, which close on Escape);
 * 2. takes the page's own step back (a task's page back to the task list);
 * 3. goes to Home from any other page;
 * 4. on Home, leaves the app, as Android's back does on an app's first screen.
 *
 * Only where the platform has a back button (Android); elsewhere it's a no-op.
 */

import { useEffect, useRef } from 'react';
import { getBackend } from '../backend';
import { useNavigation } from '../contexts/NavigationContext';

/** Pages' own steps back, the newest last. */
const pageSteps: Array<() => void> = [];

/** While `active`, Android's back runs `step` instead of going Home (after closing anything open). */
export function useBackStep(active: boolean, step: () => void): void {
  const latest = useRef(step);
  latest.current = step;
  useEffect(() => {
    if (!active) return;
    const run = () => latest.current();
    pageSteps.push(run);
    return () => {
      pageSteps.splice(pageSteps.indexOf(run), 1);
    };
  }, [active]);
}

/**
 * Open, not just still on screen: a modal that's closing stays in the page
 * until its animation ends, and a quick second back should go past it. MUI's
 * focus trap is on (its sentinels tabbable) only while the modal is open.
 */
const isOpen = (modal: Element) =>
  modal.querySelector(':scope > [data-testid="sentinelStart"]')?.getAttribute('tabindex') === '0';

/** Closes the modal opened last, as Escape does. False when none is open. */
function closeTopModal(): boolean {
  const open = [...document.querySelectorAll<HTMLElement>('.MuiModal-root')].filter(isOpen);
  const top = open[open.length - 1];
  if (!top) return false;
  top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}

/** Takes over Android's back for the app's lifetime. Called once, in the app's shell. */
export function useBackButton(): void {
  const { view, navigate } = useNavigation();
  const current = useRef({ view, navigate });
  current.current = { view, navigate };

  useEffect(() => {
    const backButton = getBackend().platform.backButton;
    if (!backButton) return;
    let stop: (() => void) | undefined;
    let unmounted = false;
    void backButton
      .listen(() => {
        if (closeTopModal()) return;
        const step = pageSteps[pageSteps.length - 1];
        if (step) step();
        else if (current.current.view !== 'home') current.current.navigate('home');
        else backButton.leaveApp();
      })
      .then(unlisten => {
        if (unmounted) unlisten();
        else stop = unlisten;
      });
    return () => {
      unmounted = true;
      stop?.();
    };
  }, []);
}
