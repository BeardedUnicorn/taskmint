/**
 * Tauri Environment Detection and Safe API Access
 * 
 * Provides utilities to detect if we're running in a Tauri environment
 * and safely access Tauri APIs with fallbacks for web environments.
 */

/**
 * Check if we're running in a Tauri environment
 */
export function isTauriEnvironment(): boolean {
  try {
    // Check if window.__TAURI__ exists (Tauri v2)
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      return true;
    }
    
    // Check if window.__TAURI_INTERNALS__ exists (Tauri v2)
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      return true;
    }
    
    // Check if we can import Tauri modules
    return false;
  } catch {
    return false;
  }
}

/**
 * Safe wrapper for Tauri invoke function
 */
export async function safeInvoke<T = any>(command: string, args?: any): Promise<T | null> {
  if (!isTauriEnvironment()) {
    console.warn(`Tauri invoke '${command}' called in non-Tauri environment, skipping`);
    return null;
  }
  
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (error) {
    console.warn(`Failed to invoke Tauri command '${command}':`, error);
    return null;
  }
}

/**
 * Safe wrapper for Tauri listen function
 */
export async function safeListen(
  event: string, 
  handler: (event: any) => void
): Promise<(() => void) | null> {
  if (!isTauriEnvironment()) {
    console.warn(`Tauri listen '${event}' called in non-Tauri environment, skipping`);
    return null;
  }
  
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unsubscribe = await listen(event, handler);
    return unsubscribe;
  } catch (error) {
    console.warn(`Failed to listen to Tauri event '${event}':`, error);
    return null;
  }
}

/**
 * Safe wrapper for Tauri emit function
 */
export async function safeEmit(event: string, payload?: any): Promise<void> {
  if (!isTauriEnvironment()) {
    console.warn(`Tauri emit '${event}' called in non-Tauri environment, skipping`);
    return;
  }
  
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(event, payload);
  } catch (error) {
    console.warn(`Failed to emit Tauri event '${event}':`, error);
  }
}

/**
 * Get environment type
 */
export function getEnvironmentType(): 'tauri' | 'web' {
  return isTauriEnvironment() ? 'tauri' : 'web';
}

/**
 * Log environment information
 */
export function logEnvironmentInfo(): void {
  const envType = getEnvironmentType();
  console.log(`Running in ${envType} environment`);
  
  if (envType === 'web') {
    console.log('Tauri APIs will be mocked or skipped');
  }
}
