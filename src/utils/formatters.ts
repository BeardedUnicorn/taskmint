/**
 * Formatting Utilities
 * 
 * This file contains utility functions for formatting various data types
 * including time, currency, and other display formats.
 */

/**
 * Format time duration from milliseconds to HH:MM:SS format
 */
export function formatTime(milliseconds: number): string {
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
 * Parse time input string (HH:MM:SS) to milliseconds
 */
export function parseTimeInput(timeStr: string): number {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  const seconds = parseInt(parts[2] || '0', 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * Format currency amount with proper symbol and formatting
 */
export function formatCurrency(amount: string | number): string {
  const numericAmount = typeof amount === 'string' 
    ? parseFloat(amount.replace(/[$,]/g, '')) 
    : amount;
  
  if (isNaN(numericAmount)) {
    return '$0.00';
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numericAmount);
}

/**
 * Format percentage with specified decimal places
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format large numbers with appropriate suffixes (K, M, B)
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
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

/**
 * Count the number of lines in a text string
 */
export function countTextLines(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  return text.split(/\r\n|\r|\n/).length;
}

/**
 * Truncate text to a specific number of lines
 */
export function truncateToLines(text: string, maxLines: number): string {
  if (!text || typeof text !== 'string' || maxLines <= 0) {
    return '';
  }

  const lines = text.split(/\r\n|\r|\n/);

  if (lines.length <= maxLines) {
    return text;
  }

  return lines.slice(0, maxLines).join('\n') + '...';
}
