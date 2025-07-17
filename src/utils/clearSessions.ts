import { invoke } from '@tauri-apps/api/core';

export async function clearAllSessions(): Promise<void> {
  try {
    await invoke('clear_all_sessions');
    console.log('All sessions cleared successfully');
  } catch (error) {
    console.error('Failed to clear sessions:', error);
    throw error;
  }
}
