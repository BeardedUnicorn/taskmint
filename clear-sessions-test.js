// Simple test script to clear sessions via Tauri command
const { invoke } = require('@tauri-apps/api/core');

async function clearSessions() {
  try {
    console.log('Clearing all sessions...');
    await invoke('clear_all_sessions');
    console.log('✅ All sessions cleared successfully!');
  } catch (error) {
    console.error('❌ Failed to clear sessions:', error);
  }
}

// Run the test
clearSessions();
