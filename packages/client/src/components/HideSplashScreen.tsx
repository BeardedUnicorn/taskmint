/**
 * Android keeps its launch screen over the app until the app has drawn, so a
 * cold start shows TaskMint instead of a blank page or a loading skeleton.
 * Rendered next to what the app first shows (the page, or an error), this
 * takes the launch screen down once that's on screen and `when` holds;
 * later calls do nothing. Elsewhere there's no launch screen.
 */

import { useEffect } from 'react';
import { getBackend } from '../backend';

export function HideSplashScreen({ when = true }: { when?: boolean }): null {
  useEffect(() => {
    if (!when) return;
    // Effects run before the browser paints, and a page can take a while to
    // paint on a slow phone: the second frame from now comes after it.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => getBackend().platform.splashScreen?.hide());
    });
    return () => cancelAnimationFrame(frame);
  }, [when]);
  return null;
}
