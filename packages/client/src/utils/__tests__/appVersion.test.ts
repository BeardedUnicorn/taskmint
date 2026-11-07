import { describe, it, expect } from 'vitest';
import packageJson from '../../../package.json';
import { APP_VERSION, compareVersions, isVersion } from '../appVersion';

describe('appVersion', () => {
  it("is this package's version", () => {
    expect(APP_VERSION).toBe(packageJson.version);
    expect(isVersion(APP_VERSION)).toBe(true);
  });

  it('tells a version from anything else', () => {
    expect(isVersion('2.10.0')).toBe(true);
    expect(isVersion('v2.1.0')).toBe(false);
    expect(isVersion('2.1')).toBe(false);
    expect(isVersion(2)).toBe(false);
    expect(isVersion(null)).toBe(false);
  });

  it('orders versions by major, then minor, then patch', () => {
    expect(compareVersions('2.1.0', '2.0.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.9', '2.1.0')).toBeLessThan(0);
    expect(compareVersions('3.0.0', '2.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.10', '2.0.9')).toBeGreaterThan(0);
    expect(compareVersions('2.1.0', '2.1.0')).toBe(0);
  });
});
