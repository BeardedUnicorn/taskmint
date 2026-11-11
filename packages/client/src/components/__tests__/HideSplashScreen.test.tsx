import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { fakeBackend, installFakeBackendForTest } from '../../testing';
import { HideSplashScreen } from '../HideSplashScreen';

describe('HideSplashScreen', () => {
  it("takes a phone's launch screen down once what's with it has painted, not on each render", async () => {
    const { hide } = fakeBackend().platform.splashScreen;
    hide.mockClear();

    const { rerender, container } = render(<HideSplashScreen />);
    rerender(<HideSplashScreen />);
    // Not before the browser has painted
    expect(hide).not.toHaveBeenCalled();

    await waitFor(() => expect(hide).toHaveBeenCalled());
    expect(hide).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('waits until `when` holds', async () => {
    const { hide } = fakeBackend().platform.splashScreen;
    hide.mockClear();

    const { rerender } = render(<HideSplashScreen when={false} />);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(hide).not.toHaveBeenCalled();

    rerender(<HideSplashScreen when />);
    await waitFor(() => expect(hide).toHaveBeenCalledTimes(1));
  });

  it('leaves it to whatever shows next when it goes before then', async () => {
    const { hide } = fakeBackend().platform.splashScreen;
    hide.mockClear();

    render(<HideSplashScreen />).unmount();
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(hide).not.toHaveBeenCalled();
  });

  it('does nothing where the platform has no launch screen', async () => {
    installFakeBackendForTest({ without: ['splashScreen'] });
    expect(render(<HideSplashScreen />).container).toBeEmptyDOMElement();
    await new Promise(resolve => setTimeout(resolve, 100));
  });
});
