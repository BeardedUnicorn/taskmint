// Simple test script to verify timer creation functionality
// This script can be run in the browser console to test the fix

console.log('🧪 Testing Timer Creation Functionality');

// Test 1: Check if the application is loaded
function testAppLoaded() {
  console.log('Test 1: Checking if app is loaded...');
  const root = document.getElementById('root');
  if (root && root.children.length > 0) {
    console.log('✅ App is loaded');
    return true;
  } else {
    console.log('❌ App is not loaded');
    return false;
  }
}

// Test 2: Check if Sessions view is accessible
function testSessionsView() {
  console.log('Test 2: Checking Sessions view...');
  // Look for Sessions navigation item
  const sessionsNav = Array.from(document.querySelectorAll('*')).find(el => 
    el.textContent && el.textContent.includes('Sessions') && el.tagName === 'SPAN'
  );
  
  if (sessionsNav) {
    console.log('✅ Sessions navigation found');
    // Click on Sessions to navigate
    const button = sessionsNav.closest('button');
    if (button) {
      button.click();
      console.log('✅ Clicked Sessions navigation');
      return true;
    }
  }
  console.log('❌ Sessions navigation not found');
  return false;
}

// Test 3: Check for Add Timer button
function testAddTimerButton() {
  console.log('Test 3: Looking for Add Timer button...');
  
  // Wait a bit for the page to load
  setTimeout(() => {
    const addTimerButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
      btn.textContent && btn.textContent.includes('Add Timer')
    );
    
    if (addTimerButtons.length > 0) {
      console.log(`✅ Found ${addTimerButtons.length} Add Timer button(s)`);
      
      // Try to click the first one
      const button = addTimerButtons[0];
      console.log('🖱️ Attempting to click Add Timer button...');
      button.click();
      
      // Check for any console logs or errors
      setTimeout(() => {
        console.log('⏱️ Waiting for timer creation response...');
      }, 1000);
      
    } else {
      console.log('❌ Add Timer button not found');
      console.log('Available buttons:', Array.from(document.querySelectorAll('button')).map(btn => btn.textContent));
    }
  }, 2000);
}

// Test 4: Check for active session
function testActiveSession() {
  console.log('Test 4: Checking for active session...');
  
  // Look for session-related elements
  const sessionElements = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent && (
      el.textContent.includes('Active Session') || 
      el.textContent.includes('Session') ||
      el.textContent.includes('Timer')
    )
  );
  
  console.log('Session-related elements found:', sessionElements.length);
  sessionElements.forEach((el, index) => {
    console.log(`  ${index + 1}. ${el.tagName}: "${el.textContent.substring(0, 50)}..."`);
  });
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Timer Creation Tests...');
  
  if (!testAppLoaded()) {
    console.log('❌ Cannot proceed - app not loaded');
    return;
  }
  
  // Wait for app to fully initialize
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  testSessionsView();
  
  // Wait for navigation
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  testActiveSession();
  testAddTimerButton();
  
  console.log('🏁 Tests completed. Check console for results.');
}

// Auto-run tests
runTests();
