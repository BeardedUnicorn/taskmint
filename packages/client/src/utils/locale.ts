/**
 * The locale dates, times and amounts are written in: the system's, unless
 * one is pinned (the tests pin en-US so their expected text holds on any
 * machine). Every formatter in the app goes through here.
 */

let pinned: string | undefined;

/** Pin a locale (undefined: back to the system's). */
export function setFormattingLocale(locale: string | undefined): void {
  pinned = locale;
}

/** The locale to pass to Intl and toLocale*String; undefined means the system's. */
export function formattingLocale(): string | undefined {
  return pinned;
}

const asDate = (value: Date | string | number) => (value instanceof Date ? value : new Date(value));

/** "Oct 14" */
export function formatShortDate(value: Date | string | number): string {
  return asDate(value).toLocaleDateString(pinned, { month: 'short', day: 'numeric' });
}

/** "2:43 PM" */
export function formatClockTime(value: Date | string | number): string {
  return asDate(value).toLocaleTimeString(pinned, { hour: 'numeric', minute: '2-digit' });
}

/** "Oct 14, 2:43 PM" */
export function formatShortDateTime(value: Date | string | number): string {
  return asDate(value).toLocaleString(pinned, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The date and time in full ("10/14/2026, 2:43:05 PM"). */
export function formatDateTime(value: Date | string | number): string {
  return asDate(value).toLocaleString(pinned);
}

/** A number with grouping ("12,345"). */
export function formatNumber(value: number): string {
  return value.toLocaleString(pinned);
}
