/**
 * A note's field values: blank values for a template, number coercion,
 * emptiness and validation. Shared by the note editor and TaskNotesService,
 * so what the form accepts is what the store accepts.
 */

import { TemplateField } from '../types/notes';

export type FieldValues = Record<string, unknown>;

/** A free-form note's single field. */
export const FREE_FORM_CONTENT = 'content';

/** A blank draft: '' for text, dates and selects, null for numbers, unchecked boxes. */
export function emptyValues(fields: readonly TemplateField[] | null | undefined): FieldValues {
  if (!fields) return { [FREE_FORM_CONTENT]: '' };
  const values: FieldValues = {};
  for (const field of fields) {
    values[field.id] = field.type === 'number' ? null : field.type === 'checkbox' ? false : '';
  }
  return values;
}

/** A number input's value as a number; blank (or not a number) is null. */
export function coerceNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(number) ? null : number;
}

/** The values with every number field as a number or null. */
export function coerceNumbers(fields: readonly TemplateField[] | null | undefined, values: FieldValues): FieldValues {
  if (!fields) return { ...values };
  const result = { ...values };
  for (const field of fields) {
    if (field.type === 'number') result[field.id] = coerceNumber(result[field.id]);
  }
  return result;
}

/** Nothing filled in: blank text, no number or date, unchecked. */
export function isEmptyDraft(values: FieldValues): boolean {
  return Object.values(values).every(
    value =>
      value === undefined ||
      value === null ||
      value === false ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
  );
}

const isBlank = (value: unknown) => value === undefined || value === null || value === '';

/** A message for each field whose value isn't acceptable, by field id. */
export function validateFieldValues(fields: readonly TemplateField[], values: FieldValues): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = values[field.id];
    const { label, validation } = field;

    if (isBlank(value) || (field.type === 'checkbox' && value === false)) {
      if (field.required) errors[field.id] = `${label} is required`;
      continue;
    }

    switch (field.type) {
      case 'number': {
        const number = Number(value);
        if (Number.isNaN(number)) {
          errors[field.id] = `${label} must be a valid number`;
        } else if (validation?.min !== undefined && number < validation.min) {
          errors[field.id] = `${label} must be at least ${validation.min}`;
        } else if (validation?.max !== undefined && number > validation.max) {
          errors[field.id] = `${label} must be at most ${validation.max}`;
        }
        break;
      }
      case 'date':
        if (!(value instanceof Date) && Number.isNaN(Date.parse(String(value)))) {
          errors[field.id] = `${label} must be a valid date`;
        }
        break;
      case 'text':
        if (typeof value !== 'string') {
          errors[field.id] = `${label} must be text`;
        } else if (validation?.min !== undefined && value.length < validation.min) {
          errors[field.id] = `${label} must be at least ${validation.min} characters`;
        } else if (validation?.max !== undefined && value.length > validation.max) {
          errors[field.id] = `${label} must be at most ${validation.max} characters`;
        } else if (validation?.pattern && !new RegExp(validation.pattern).test(value)) {
          errors[field.id] = `${label} format is invalid`;
        }
        break;
      case 'checkbox':
        if (typeof value !== 'boolean') errors[field.id] = `${label} must be a boolean`;
        break;
      case 'select':
        if (typeof value !== 'string' || !field.options?.some(option => option.value === value)) {
          errors[field.id] = `${label} must be one of the available options`;
        }
        break;
    }
  }
  return errors;
}

/** Fields in their template order (without reordering the template's own list). */
export function orderedFields(fields: readonly TemplateField[]): TemplateField[] {
  return [...fields].sort((a, b) => a.order - b.order);
}
