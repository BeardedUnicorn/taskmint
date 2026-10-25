/**
 * Formatting Utilities
 * 
 * This file contains utility functions for formatting various data types
 * including time, currency, and other display formats.
 */

import { formattingLocale } from './locale';

/**
 * Format time duration from milliseconds to HH:MM:SS format
 */
export function formatTime(milliseconds: number): string {
  // Handle invalid input values
  if (typeof milliseconds !== 'number' || isNaN(milliseconds) || milliseconds < 0) {
    return '00:00:00';
  }

  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format duration from milliseconds to human-readable format (e.g., "2h 30m")
 */
export function formatDuration(milliseconds: number): string {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

/**
 * A duration for a sentence: "2h 30m", or "45m" under an hour
 */
export function formatDurationCompact(milliseconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Format date to human-readable format
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString(formattingLocale(), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format currency amount with proper symbol and formatting
 */
export function formatCurrency(amount: string | number, currency = 'USD'): string {
  const numericAmount = typeof amount === 'string'
    ? parseFloat(amount.replace(/[$,]/g, ''))
    : amount;

  const format = (value: number, code: string) =>
    new Intl.NumberFormat(formattingLocale(), { style: 'currency', currency: code }).format(value);
  const value = isNaN(numericAmount) ? 0 : numericAmount;
  try {
    return format(value, currency);
  } catch {
    // Not an ISO currency code
    return format(value, 'USD');
  }
}

/**
 * Format multi-line text for display, preserving line breaks and handling long lines
 */
export function formatMultilineText(text: string, maxLength?: number): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Normalize line breaks to \n
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (maxLength && normalizedText.length > maxLength) {
    return normalizedText.substring(0, maxLength) + '...';
  }

  return normalizedText;
}

/**
 * Create a preview of multi-line text suitable for list displays
 */
export function createTextPreview(text: string, maxLength: number = 100): string {
  if (!text || typeof text !== 'string') {
    return 'No content';
  }

  // Replace line breaks with bullet points for preview
  const singleLinePreview = text
    .replace(/\n+/g, ' • ')
    .replace(/\s+/g, ' ')
    .trim();

  if (singleLinePreview.length > maxLength) {
    return singleLinePreview.substring(0, maxLength) + '...';
  }

  return singleLinePreview;
}
