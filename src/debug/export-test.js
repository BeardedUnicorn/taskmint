/**
 * Export Functionality Debug Script
 * 
 * This script can be run in the browser console to test and debug
 * the export functionality. It simulates the export process and
 * provides detailed logging to help identify issues.
 */

// Test data for debugging
const testData = {
  version: '1.0.0',
  exportedAt: new Date().toISOString(),
  exportedBy: 'TaskMint',
  data: {
    timeEntries: [
      {
        id: 'test-1',
        taskName: 'Debug Test',
        startTime: '2024-01-01T09:00:00.000Z',
        endTime: '2024-01-01T10:00:00.000Z',
        duration: 3600,
        date: '2024-01-01',
        notes: 'Testing export functionality',
        taskId: 'task-1',
        hourlyRate: 50,
        earnings: 50,
      }
    ],
    tasks: [
      {
        id: 'task-1',
        name: 'Debug Task',
        hourlyRate: 50,
        color: '#FF5722',
        isActive: true,
      }
    ],
    noteTemplates: [],
    taskNotes: [],
  },
  metadata: {
    totalTimeEntries: 1,
    totalTasks: 1,
    totalNoteTemplates: 0,
    totalTaskNotes: 0,
    dateRange: {
      earliest: '2024-01-01',
      latest: '2024-01-01',
    },
  },
};

/**
 * Test the export functionality step by step
 */
function testExportFunctionality() {
  console.log('🧪 Testing Export Functionality...\n');
  
  try {
    // Step 1: Test JSON serialization
    console.log('📝 Step 1: Testing JSON serialization...');
    const jsonString = JSON.stringify(testData, null, 2);
    console.log(`✅ JSON serialization successful (${jsonString.length} characters)`);
    
    // Step 2: Test Blob creation
    console.log('\n📦 Step 2: Testing Blob creation...');
    const blob = new Blob([jsonString], { type: 'application/json' });
    console.log(`✅ Blob created successfully (size: ${blob.size} bytes, type: ${blob.type})`);
    
    // Step 3: Test URL creation
    console.log('\n🔗 Step 3: Testing URL creation...');
    const url = URL.createObjectURL(blob);
    console.log(`✅ Object URL created: ${url}`);
    
    // Step 4: Test link creation and properties
    console.log('\n📎 Step 4: Testing link creation...');
    const link = document.createElement('a');
    link.href = url;
    link.download = `debug-export-${new Date().toISOString().split('T')[0]}.json`;
    link.style.display = 'none';
    
    console.log(`✅ Link created with href: ${link.href}`);
    console.log(`✅ Download filename: ${link.download}`);
    
    // Step 5: Test DOM manipulation
    console.log('\n🏗️ Step 5: Testing DOM manipulation...');
    document.body.appendChild(link);
    console.log('✅ Link appended to document body');
    
    // Step 6: Simulate click (this should trigger download)
    console.log('\n🖱️ Step 6: Simulating download click...');
    console.log('⚠️ This will attempt to download a file to your Downloads folder');
    
    // Ask for confirmation before downloading
    if (confirm('Do you want to proceed with the download test? This will download a test file.')) {
      link.click();
      console.log('✅ Click simulated - check your Downloads folder');
    } else {
      console.log('⏭️ Download test skipped by user');
    }
    
    // Step 7: Cleanup
    console.log('\n🧹 Step 7: Cleanup...');
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log('✅ Cleanup completed');
    
    console.log('\n🎉 Export functionality test completed successfully!');
    console.log('📁 If you proceeded with the download, check your Downloads folder for the test file.');
    
    return true;
  } catch (error) {
    console.error('\n❌ Export test failed:', error);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

/**
 * Test browser compatibility for export features
 */
function testBrowserCompatibility() {
  console.log('🔍 Testing Browser Compatibility...\n');
  
  const tests = [
    {
      name: 'Blob constructor',
      test: () => typeof Blob !== 'undefined' && typeof Blob === 'function',
      required: true,
    },
    {
      name: 'URL.createObjectURL',
      test: () => typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function',
      required: true,
    },
    {
      name: 'URL.revokeObjectURL',
      test: () => typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function',
      required: true,
    },
    {
      name: 'document.createElement',
      test: () => typeof document !== 'undefined' && typeof document.createElement === 'function',
      required: true,
    },
    {
      name: 'document.body.appendChild',
      test: () => typeof document !== 'undefined' && document.body && typeof document.body.appendChild === 'function',
      required: true,
    },
    {
      name: 'document.body.removeChild',
      test: () => typeof document !== 'undefined' && document.body && typeof document.body.removeChild === 'function',
      required: true,
    },
    {
      name: 'localStorage',
      test: () => typeof localStorage !== 'undefined',
      required: false,
    },
    {
      name: 'JSON.stringify',
      test: () => typeof JSON !== 'undefined' && typeof JSON.stringify === 'function',
      required: true,
    },
  ];
  
  let allRequired = true;
  let allOptional = true;
  
  tests.forEach(test => {
    try {
      const passed = test.test();
      const status = passed ? '✅' : '❌';
      const requirement = test.required ? '(Required)' : '(Optional)';
      
      console.log(`${status} ${test.name} ${requirement}: ${passed ? 'Available' : 'Not available'}`);
      
      if (test.required && !passed) {
        allRequired = false;
      }
      if (!test.required && !passed) {
        allOptional = false;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: Error - ${error.message}`);
      if (test.required) {
        allRequired = false;
      }
    }
  });
  
  console.log('\n📊 Compatibility Summary:');
  console.log(`Required features: ${allRequired ? '✅ All supported' : '❌ Some missing'}`);
  console.log(`Optional features: ${allOptional ? '✅ All supported' : '⚠️ Some missing'}`);
  
  if (allRequired) {
    console.log('🎉 Your browser supports all required features for export functionality!');
  } else {
    console.log('⚠️ Your browser is missing some required features. Export may not work properly.');
  }
  
  return allRequired;
}

/**
 * Check current localStorage data
 */
function checkLocalStorageData() {
  console.log('💾 Checking localStorage data...\n');
  
  const keys = ['timeEntries', 'predefinedTasks', 'noteTemplates', 'taskNotes'];
  let hasData = false;
  
  keys.forEach(key => {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        const count = Array.isArray(parsed) ? parsed.length : (parsed ? 1 : 0);
        console.log(`✅ ${key}: ${count} items`);
        hasData = true;
      } else {
        console.log(`⚪ ${key}: No data`);
      }
    } catch (error) {
      console.log(`❌ ${key}: Error reading data - ${error.message}`);
    }
  });
  
  if (hasData) {
    console.log('\n📊 You have data that can be exported!');
  } else {
    console.log('\n⚪ No data found in localStorage. Export will create an empty backup.');
  }
  
  return hasData;
}

/**
 * Run all debug tests
 */
function runAllDebugTests() {
  console.clear();
  console.log('🚀 Export Functionality Debug Suite\n');
  console.log('='.repeat(50));
  
  // Test 1: Browser compatibility
  const compatibilityPassed = testBrowserCompatibility();
  console.log('\n' + '='.repeat(50));
  
  // Test 2: Check existing data
  const hasData = checkLocalStorageData();
  console.log('\n' + '='.repeat(50));
  
  // Test 3: Export functionality (only if compatible)
  if (compatibilityPassed) {
    const exportPassed = testExportFunctionality();
    console.log('\n' + '='.repeat(50));
    
    console.log('\n🏁 Debug Summary:');
    console.log(`Browser Compatibility: ${compatibilityPassed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Data Available: ${hasData ? '✅ YES' : '⚪ NO'}`);
    console.log(`Export Test: ${exportPassed ? '✅ PASS' : '❌ FAIL'}`);
    
    if (compatibilityPassed && exportPassed) {
      console.log('\n🎉 Export functionality should work correctly!');
      console.log('💡 Try clicking the Export Data button in Settings.');
    } else {
      console.log('\n⚠️ Export functionality may have issues.');
    }
  } else {
    console.log('\n❌ Skipping export test due to browser compatibility issues.');
  }
}

// Make functions available globally
window.debugExport = {
  testExportFunctionality,
  testBrowserCompatibility,
  checkLocalStorageData,
  runAllDebugTests,
};

// Instructions
console.log(`
🧪 Export Debug Tools Loaded

Available functions:
- debugExport.runAllDebugTests() - Run all tests
- debugExport.testBrowserCompatibility() - Check browser support
- debugExport.checkLocalStorageData() - Check existing data
- debugExport.testExportFunctionality() - Test export process

Quick start: Run debugExport.runAllDebugTests()
`);
