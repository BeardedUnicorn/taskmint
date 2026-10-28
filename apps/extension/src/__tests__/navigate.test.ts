// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { navigate } from '../navigate';

it('navigates the page', () => {
  // jsdom only navigates within the page
  navigate('#capture');
  expect(location.hash).toBe('#capture');
});
