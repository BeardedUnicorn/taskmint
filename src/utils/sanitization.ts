/**
 * Input Sanitization Utilities
 * 
 * This file contains utility functions for sanitizing user input to prevent
 * security vulnerabilities and ensure data integrity.
 */

/**
 * Basic input sanitization - removes potentially dangerous characters
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/['"]/g, '') // Remove quotes that could break JSON
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 1000); // Limit length to prevent DoS
}

/**
 * Sanitize task name - allows only safe characters for task names
 */
export function sanitizeTaskName(taskName: string): string {
  if (typeof taskName !== 'string') {
    return '';
  }

  return taskName
    .trim()
    .replace(/[^\w\s\-_.]/g, '') // Allow only word characters, spaces, hyphens, underscores, and dots
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .substring(0, 100); // Limit to 100 characters
}

/**
 * Sanitize file name - ensures safe file names
 */
export function sanitizeFileName(fileName: string): string {
  if (typeof fileName !== 'string') {
    return '';
  }

  return fileName
    .trim()
    .replace(/[^\w\s\-_.]/g, '') // Allow only safe characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .substring(0, 255); // Limit to 255 characters (filesystem limit)
}

/**
 * Sanitize URL - basic URL validation and sanitization
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();
  
  // Check if it's a valid URL format
  try {
    const urlObj = new URL(trimmed);
    // Only allow http and https protocols
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return urlObj.toString();
    }
  } catch {
    // Invalid URL format
  }
  
  return '';
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') {
    return '';
  }

  const trimmed = email.trim().toLowerCase();
  
  // Basic email validation regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (emailRegex.test(trimmed) && trimmed.length <= 254) {
    return trimmed;
  }
  
  return '';
}

/**
 * Sanitize numeric input - ensures valid numbers
 */
export function sanitizeNumber(input: string | number, options: {
  min?: number;
  max?: number;
  decimals?: number;
} = {}): number | null {
  let num: number;

  if (typeof input === 'number') {
    num = input;
  } else if (typeof input === 'string') {
    // Remove non-numeric characters except decimal point and minus sign
    const cleaned = input.replace(/[^\d.-]/g, '');
    num = parseFloat(cleaned);
  } else {
    return null;
  }

  // Check if it's a valid number
  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  // Apply min/max constraints
  if (options.min !== undefined && num < options.min) {
    num = options.min;
  }
  if (options.max !== undefined && num > options.max) {
    num = options.max;
  }

  // Apply decimal places constraint
  if (options.decimals !== undefined) {
    num = parseFloat(num.toFixed(options.decimals));
  }

  return num;
}

/**
 * Sanitize currency amount
 */
export function sanitizeCurrency(input: string): number | null {
  if (typeof input !== 'string') {
    return null;
  }

  // Remove currency symbols and whitespace
  const cleaned = input
    .replace(/[$€£¥₹]/g, '') // Remove common currency symbols
    .replace(/[,\s]/g, '') // Remove commas and spaces
    .trim();

  return sanitizeNumber(cleaned, { min: 0, decimals: 2 });
}

/**
 * Sanitize date string - ensures valid date format
 */
export function sanitizeDate(dateString: string): string | null {
  if (typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();
  
  // Check for YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(trimmed)) {
    return null;
  }

  // Validate that it's a real date
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    return null;
  }

  // Check that the date string matches what we get back from the Date object
  // This catches invalid dates like 2023-02-30
  if (date.toISOString().split('T')[0] !== trimmed) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize time string - ensures valid time format (HH:MM or HH:MM:SS)
 */
export function sanitizeTime(timeString: string): string | null {
  if (typeof timeString !== 'string') {
    return null;
  }

  const trimmed = timeString.trim();
  
  // Check for HH:MM or HH:MM:SS format
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;
  const match = trimmed.match(timeRegex);
  
  if (!match) {
    return null;
  }

  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  const seconds = match[3] || '00';

  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Sanitize JSON string - ensures valid JSON and removes potentially dangerous content
 */
export function sanitizeJson(jsonString: string): any | null {
  if (typeof jsonString !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonString);
    
    // Recursively sanitize the parsed object
    return sanitizeObject(parsed);
  } catch {
    return null;
  }
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeInput(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize the key as well
      const sanitizedKey = sanitizeInput(key);
      if (sanitizedKey) {
        sanitized[sanitizedKey] = sanitizeObject(value);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize HTML content - removes all HTML tags
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string') {
    return '';
  }

  return html
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/&[a-zA-Z0-9#]+;/g, '') // Remove HTML entities
    .trim();
}

/**
 * Sanitize search query - prepares user input for safe searching
 */
export function sanitizeSearchQuery(query: string): string {
  if (typeof query !== 'string') {
    return '';
  }

  return query
    .trim()
    .replace(/[^\w\s\-_.]/g, '') // Allow only safe characters
    .replace(/\s+/g, ' ') // Normalize spaces
    .substring(0, 200); // Limit length
}

/**
 * Validate and sanitize ID strings
 */
export function sanitizeId(id: string): string | null {
  if (typeof id !== 'string') {
    return null;
  }

  const trimmed = id.trim();
  
  // IDs should only contain alphanumeric characters, hyphens, and underscores
  const idRegex = /^[a-zA-Z0-9_-]+$/;
  
  if (idRegex.test(trimmed) && trimmed.length > 0 && trimmed.length <= 100) {
    return trimmed;
  }
  
  return null;
}

/**
 * Comprehensive input sanitization for form data
 */
export function sanitizeFormData(formData: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(formData)) {
    const sanitizedKey = sanitizeInput(key);
    if (!sanitizedKey) continue;

    if (typeof value === 'string') {
      sanitized[sanitizedKey] = sanitizeInput(value);
    } else if (typeof value === 'number') {
      sanitized[sanitizedKey] = sanitizeNumber(value);
    } else if (typeof value === 'boolean') {
      sanitized[sanitizedKey] = value;
    } else if (Array.isArray(value)) {
      sanitized[sanitizedKey] = value.map(item => 
        typeof item === 'string' ? sanitizeInput(item) : item
      );
    } else if (value && typeof value === 'object') {
      sanitized[sanitizedKey] = sanitizeFormData(value);
    }
  }

  return sanitized;
}
