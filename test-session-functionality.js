// Test script to verify session functionality works correctly
import { invoke } from '@tauri-apps/api/core';

async function testSessionFunctionality() {
  try {
    console.log('🧪 Testing session functionality...');
    
    // Step 1: Clear any existing sessions
    console.log('1. Clearing existing sessions...');
    await invoke('clear_all_sessions');
    console.log('✅ Sessions cleared');
    
    // Step 2: Create a new session with timer
    console.log('2. Creating new session with timer...');
    const [session, timerInstance] = await invoke('create_session_with_timer', {
      taskId: 'test-task-1',
      taskName: 'Test Task for Session'
    });
    console.log('✅ Session created:', session);
    console.log('✅ Timer instance created:', timerInstance);
    
    // Step 3: Get all sessions to verify
    console.log('3. Retrieving all sessions...');
    const sessions = await invoke('get_sessions');
    console.log('✅ Sessions retrieved:', sessions);
    
    // Step 4: Add another timer instance to the session
    console.log('4. Adding another timer instance...');
    const newTimerInstance = await invoke('create_timer_instance', {
      sessionId: session.id
    });
    console.log('✅ New timer instance created:', newTimerInstance);
    
    // Step 5: Start the new timer instance
    console.log('5. Starting the new timer instance...');
    const updatedSession = await invoke('start_timer_instance', {
      instanceId: newTimerInstance.id
    });
    console.log('✅ Timer instance started:', updatedSession);
    
    console.log('🎉 All session functionality tests passed!');
    
  } catch (error) {
    console.error('❌ Session functionality test failed:', error);
  }
}

// Run the test
testSessionFunctionality();
