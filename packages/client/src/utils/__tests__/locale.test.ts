import { describe, it, expect, afterEach } from 'vitest';
import {
  formatClockTime,
  formatShortDate,
  formatShortDateTime,
  formatMonthYear,
  formatWeekdayDate,
  formatWeekdayDateTime,
  formattingLocale,
  setFormattingLocale,
} from '../locale';
import { formatCurrency } from '../formatters';

const AT = new Date(2026, 9, 14, 14, 43);

describe('formatting locale', () => {
  afterEach(() => setFormattingLocale('en-US'));

  it('is pinned to US English for the tests', () => {
    expect(formattingLocale()).toBe('en-US');
    expect(formatShortDate(AT)).toBe('Oct 14');
    expect(formatClockTime(AT)).toBe('2:43 PM');
    expect(formatShortDateTime(AT)).toBe('Oct 14, 2:43 PM');
    expect(formatWeekdayDate(AT)).toBe('Wed, Oct 14');
    expect(formatWeekdayDateTime(AT)).toBe('Wed, Oct 14, 2:43 PM');
    expect(formatMonthYear(AT)).toBe('October 2026');
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it("follows another locale, the way the app follows the system's", () => {
    setFormattingLocale('de-DE');
    expect(formatShortDate(AT)).toBe('14. Okt.');
    expect(formatClockTime(AT)).toBe('14:43');
    expect(formatCurrency(1234.5, 'EUR')).toBe('1.234,50\u00a0€');
  });

  it('takes ISO strings and timestamps too', () => {
    expect(formatShortDate(AT.toISOString())).toBe('Oct 14');
    expect(formatShortDate(AT.getTime())).toBe('Oct 14');
  });
});
