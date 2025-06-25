/**
 * Environment Variable Utilities
 * 
 * Provides standardized access to environment variables across the application,
 * handling both Vite and test environments consistently.
 */

// Type-safe environment variable keys
export type EnvironmentVariable = 
  | 'VITE_GOOGLE_CLIENT_ID'
  | 'VITE_GOOGLE_CLIENT_SECRET';

/**
 * Get environment variable value with fallback handling
 * 
 * @param key - The environment variable key
 * @param defaultValue - Default value if the environment variable is not found
 * @returns The environment variable value or default value
 */
export const getEnvVar = (key: EnvironmentVariable, defaultValue: string = ''): string => {
  // Check if we're in a test environment (Jest)
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    // Return test-specific values or default
    const testValues: Record<EnvironmentVariable, string> = {
      'VITE_GOOGLE_CLIENT_ID': 'test_client_id',
      'VITE_GOOGLE_CLIENT_SECRET': 'test_client_secret',
    };
    return testValues[key] || defaultValue;
  }

  // Check if import.meta is available (Vite environment)
  try {
    // Use eval to avoid TypeScript compilation issues with import.meta
    const importMeta = eval('import.meta');
    if (importMeta && importMeta.env) {
      return importMeta.env[key] || defaultValue;
    }
  } catch {
    // Fallback if import.meta is not available
  }

  return defaultValue;
};

/**
 * Get all environment variables as an object
 * 
 * @returns Object containing all environment variables
 */
export const getAllEnvVars = (): Record<EnvironmentVariable, string> => {
  const envVars: EnvironmentVariable[] = [
    'VITE_GOOGLE_CLIENT_ID',
    'VITE_GOOGLE_CLIENT_SECRET',
  ];

  return envVars.reduce((acc, key) => {
    acc[key] = getEnvVar(key);
    return acc;
  }, {} as Record<EnvironmentVariable, string>);
};

/**
 * Check if all required environment variables are set
 * 
 * @param requiredVars - Array of required environment variable keys
 * @returns Object with validation result and missing variables
 */
export const validateEnvVars = (requiredVars: EnvironmentVariable[]): {
  isValid: boolean;
  missingVars: EnvironmentVariable[];
} => {
  const missingVars = requiredVars.filter(key => !getEnvVar(key));
  
  return {
    isValid: missingVars.length === 0,
    missingVars,
  };
};

/**
 * Google Drive specific environment variables
 */
export const getGoogleDriveConfig = () => {
  return {
    clientId: getEnvVar('VITE_GOOGLE_CLIENT_ID'),
    clientSecret: getEnvVar('VITE_GOOGLE_CLIENT_SECRET'),
  };
};

/**
 * Check if Google Drive configuration is complete
 */
export const isGoogleDriveConfigured = (): boolean => {
  const { clientId, clientSecret } = getGoogleDriveConfig();
  return !!(clientId && clientSecret);
};
