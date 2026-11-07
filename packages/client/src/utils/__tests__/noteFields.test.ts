import { describe, it, expect } from 'vitest';
import {
  coerceNumber,
  coerceNumbers,
  emptyValues,
  isEmptyDraft,
  orderedFields,
  validateFieldValues,
} from '../noteFields';
import { TemplateField } from '../../types/notes';

const field = (overrides: Partial<TemplateField> & Pick<TemplateField, 'id' | 'type'>): TemplateField => ({
  label: overrides.id,
  required: false,
  order: 0,
  ...overrides,
});

describe('emptyValues', () => {
  it('gives each field a blank of its kind', () => {
    expect(
      emptyValues([
        field({ id: 'text', type: 'text' }),
        field({ id: 'count', type: 'number' }),
        field({ id: 'when', type: 'date' }),
        field({ id: 'done', type: 'checkbox' }),
        field({ id: 'pick', type: 'select' }),
      ])
    ).toEqual({ text: '', count: null, when: '', done: false, pick: '' });
  });

  it('is one empty content field for a free-form note', () => {
    expect(emptyValues(null)).toEqual({ content: '' });
  });
});

describe('coerceNumbers', () => {
  it('turns number inputs into numbers and blanks into null', () => {
    const fields = [
      field({ id: 'a', type: 'number' }),
      field({ id: 'b', type: 'number' }),
      field({ id: 'c', type: 'text' }),
    ];
    expect(coerceNumbers(fields, { a: '42', b: '', c: '7' })).toEqual({ a: 42, b: null, c: '7' });
  });

  it('leaves a free-form note alone', () => {
    expect(coerceNumbers(null, { content: '12' })).toEqual({ content: '12' });
  });

  it('treats something that is not a number as blank', () => {
    expect(coerceNumber('abc')).toBeNull();
    expect(coerceNumber(3)).toBe(3);
  });
});

describe('isEmptyDraft', () => {
  it('counts blank text, no number, unchecked boxes and empty lists as empty', () => {
    expect(isEmptyDraft({ a: '  ', b: null, c: undefined, d: false, e: [] })).toBe(true);
  });

  it('notices anything filled in', () => {
    expect(isEmptyDraft({ a: '', b: 0 })).toBe(false);
    expect(isEmptyDraft({ a: true })).toBe(false);
    expect(isEmptyDraft({ a: 'x' })).toBe(false);
  });
});

describe('validateFieldValues', () => {
  it('requires required fields, including a checked box', () => {
    const fields = [
      field({ id: 'name', type: 'text', label: 'Name', required: true }),
      field({ id: 'ok', type: 'checkbox', label: 'Reviewed', required: true }),
    ];
    expect(validateFieldValues(fields, { name: '', ok: false })).toEqual({
      name: 'Name is required',
      ok: 'Reviewed is required',
    });
  });

  it('skips empty optional fields', () => {
    expect(validateFieldValues([field({ id: 'n', type: 'number', validation: { min: 5 } })], { n: null })).toEqual({});
  });

  it('checks number ranges and text rules', () => {
    const fields = [
      field({ id: 'n', type: 'number', label: 'Count', validation: { min: 1, max: 10 } }),
      field({ id: 't', type: 'text', label: 'Code', validation: { pattern: '^[A-Z]+$' } }),
      field({ id: 'l', type: 'text', label: 'Long', validation: { max: 3 } }),
    ];
    expect(validateFieldValues(fields, { n: 11, t: 'abc', l: 'abcd' })).toEqual({
      n: 'Count must be at most 10',
      t: 'Code format is invalid',
      l: 'Long must be at most 3 characters',
    });
    expect(validateFieldValues(fields, { n: 0, t: 'ABC', l: 'ab' })).toEqual({ n: 'Count must be at least 1' });

    const short = [field({ id: 's', type: 'text', label: 'Summary', validation: { min: 5 } })];
    expect(validateFieldValues(short, { s: 'abc' })).toEqual({ s: 'Summary must be at least 5 characters' });
    expect(validateFieldValues(short, { s: 12345 })).toEqual({ s: 'Summary must be text' });
  });

  it('checks dates, checkboxes and select options', () => {
    const fields = [
      field({ id: 'd', type: 'date', label: 'Due' }),
      field({ id: 'c', type: 'checkbox', label: 'Done' }),
      field({ id: 's', type: 'select', label: 'Color', options: [{ label: 'Red', value: 'red' }] }),
    ];
    expect(validateFieldValues(fields, { d: 'not a date', c: 'yes', s: 'green' })).toEqual({
      d: 'Due must be a valid date',
      c: 'Done must be a boolean',
      s: 'Color must be one of the available options',
    });
    expect(validateFieldValues(fields, { d: '2026-10-14', c: true, s: 'red' })).toEqual({});
  });
});

describe('orderedFields', () => {
  it("sorts a copy, leaving the template's list as it was", () => {
    const fields = [field({ id: 'b', type: 'text', order: 1 }), field({ id: 'a', type: 'text', order: 0 })];
    expect(orderedFields(fields).map(f => f.id)).toEqual(['a', 'b']);
    expect(fields.map(f => f.id)).toEqual(['b', 'a']);
  });
});
