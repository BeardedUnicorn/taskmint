import { describe, it, expect } from 'vitest';
import { durationInputToMs, parseDuration, validateDuration, MS_PER_HOUR, MS_PER_MINUTE } from '../DurationFields';

describe('the duration fields', () => {
  it('read an empty field as 0', () => {
    expect(parseDuration({ hours: ' ', minutes: '' })).toEqual({ hours: 0, minutes: 0 });
  });

  it('count what can be read, a negative as 0, and nothing for text that is no number', () => {
    expect(durationInputToMs({ hours: '1', minutes: '30' })).toBe(MS_PER_HOUR + 30 * MS_PER_MINUTE);
    expect(durationInputToMs({ hours: '-2', minutes: '5' })).toBe(5 * MS_PER_MINUTE);
    expect(durationInputToMs({ hours: 'two', minutes: '5' })).toBe(0);
  });

  it('take whole hours and minutes under an hour', () => {
    expect(validateDuration({ hours: '1.5', minutes: '60' })).toEqual({
      hours: 'Hours must be a whole number of 0 or more',
      minutes: 'Minutes must be a whole number between 0 and 59',
    });
    expect(validateDuration({ hours: '0', minutes: '0' })).toEqual({ duration: 'Duration must be greater than zero' });
    expect(validateDuration({ hours: '2', minutes: '15' })).toEqual({});
  });
});
