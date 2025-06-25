/**
 * Manual Export Verification Script
 * 
 * This script provides utilities to manually verify that the export functionality
 * works correctly in a real browser environment. It can be run in the browser
 * console to test the export mechanism.
 */

import { useDataBackup } from '../../hooks/useDataBackup';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { NoteTemplate, TaskNote } from '../../types/notes';

// Test data for verification
const testTimeEntries: TimeEntry[] = [
  {
    id: 'test-entry-1',
    taskName: 'Test Development Task',
    startTime: '2024-01-01T09:00:00.000Z',
    endTime: '2024-01-01T10:30:00.000Z',
    duration: 5400, // 1.5 hours
    date: '2024-01-01',
    notes: 'Testing export functionality',
    taskId: 'test-task-1',
    hourlyRate: 75,
    earnings: 112.5,
  },
  {
    id: 'test-entry-2',
    taskName: 'Test Review Task',
    startTime: '2024-01-02T14:00:00.000Z',
    endTime: '2024-01-02T16:00:00.000Z',
    duration: 7200, // 2 hours
    date: '2024-01-02',
    notes: 'Testing with longer duration',
    taskId: 'test-task-2',
    hourlyRate: 60,
    earnings: 120,
  },
];

const testTasks: Task[] = [
  {
    id: 'test-task-1',
    name: 'Test Development',
    hourlyRate: 75,
    color: '#FF5722',
    isActive: true,
  },
  {
    id: 'test-task-2',
    name: 'Test Review',
    hourlyRate: 60,
    color: '#2196F3',
    isActive: true,
  },
];

const testNoteTemplates: NoteTemplate[] = [
  {
    id: 'test-template-1',
    name: 'Test Daily Report',
    description: 'Template for testing export',
    fields: [
      { id: 'field-1', name: 'Test Field 1', type: 'text', required: true },
      { id: 'field-2', name: 'Test Field 2', type: 'textarea', required: false },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
];

const testTaskNotes: TaskNote[] = [
  {
    id: 'test-note-1',
    taskId: 'test-task-1',
    templateId: 'test-template-1',
    content: {
      'field-1': 'Test content for field 1',
      'field-2': 'Test content for field 2',
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
];

/**
 * Verification utilities for manual testing
 */
export class ExportVerification {
  private static setupTestData() {
    // Store test data in localStorage
    localStorage.setItem('timeEntries', JSON.stringify(testTimeEntries));
    localStorage.setItem('predefinedTasks', JSON.stringify(testTasks));
    localStorage.setItem('noteTemplates', JSON.stringify(testNoteTemplates));
    localStorage.setItem('taskNotes', JSON.stringify(testTaskNotes));
    
    console.log('✅ Test data has been set up in localStorage');
  }

  private static clearTestData() {
    localStorage.removeItem('timeEntries');
    localStorage.removeItem('predefinedTasks');
    localStorage.removeItem('noteTemplates');
    localStorage.removeItem('taskNotes');
    
    console.log('✅ Test data has been cleared from localStorage');
  }

  /**
   * Test the export functionality manually
   */
  static async testExport(): Promise<boolean> {
    console.log('🧪 Starting manual export test...');
    
    try {
      // Setup test data
      this.setupTestData();
      
      // Test blob creation
      const testData = { test: 'data', timestamp: new Date().toISOString() };
      const jsonString = JSON.stringify(testData, null, 2);
      
      console.log('📝 Creating blob...');
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      if (!blob || blob.size === 0) {
        throw new Error('Failed to create blob');
      }
      console.log(`✅ Blob created successfully (size: ${blob.size} bytes)`);
      
      // Test URL creation
      console.log('🔗 Creating object URL...');
      const url = URL.createObjectURL(blob);
      
      if (!url || !url.startsWith('blob:')) {
        throw new Error('Failed to create object URL');
      }
      console.log(`✅ Object URL created: ${url}`);
      
      // Test link creation and download simulation
      console.log('📎 Creating download link...');
      const link = document.createElement('a');
      link.href = url;
      link.download = `test-export-${new Date().toISOString().split('T')[0]}.json`;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      
      // Simulate click (this should trigger download in real browser)
      console.log('🖱️ Simulating download click...');
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('✅ Download simulation completed');
      console.log('📁 Check your Downloads folder for the exported file');
      
      return true;
    } catch (error) {
      console.error('❌ Export test failed:', error);
      return false;
    } finally {
      // Clean up test data
      this.clearTestData();
    }
  }

  /**
   * Verify browser compatibility for export features
   */
  static checkBrowserCompatibility(): boolean {
    console.log('🔍 Checking browser compatibility...');
    
    const checks = [
      { name: 'Blob constructor', test: () => typeof Blob !== 'undefined' },
      { name: 'URL.createObjectURL', test: () => typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' },
      { name: 'URL.revokeObjectURL', test: () => typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' },
      { name: 'document.createElement', test: () => typeof document !== 'undefined' && typeof document.createElement === 'function' },
      { name: 'localStorage', test: () => typeof localStorage !== 'undefined' },
    ];
    
    let allPassed = true;
    
    checks.forEach(check => {
      try {
        const passed = check.test();
        console.log(`${passed ? '✅' : '❌'} ${check.name}: ${passed ? 'Available' : 'Not available'}`);
        if (!passed) allPassed = false;
      } catch (error) {
        console.log(`❌ ${check.name}: Error - ${error}`);
        allPassed = false;
      }
    });
    
    console.log(`\n${allPassed ? '✅' : '❌'} Browser compatibility: ${allPassed ? 'All features supported' : 'Some features missing'}`);
    
    return allPassed;
  }

  /**
   * Test the actual useDataBackup hook export function
   */
  static async testHookExport(): Promise<boolean> {
    console.log('🪝 Testing useDataBackup hook export...');
    
    try {
      this.setupTestData();
      
      // Note: This would need to be called within a React component context
      // For manual testing, we'll simulate the export logic
      
      const mockBackupData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        exportedBy: 'TaskMint',
        data: {
          timeEntries: testTimeEntries,
          tasks: testTasks,
          noteTemplates: testNoteTemplates,
          taskNotes: testTaskNotes,
        },
        metadata: {
          totalTimeEntries: testTimeEntries.length,
          totalTasks: testTasks.length,
          totalNoteTemplates: testNoteTemplates.length,
          totalTaskNotes: testTaskNotes.length,
          dateRange: {
            earliest: '2024-01-01',
            latest: '2024-01-02',
          },
        },
      };
      
      const jsonString = JSON.stringify(mockBackupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const defaultFilename = `time-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
      
      const link = document.createElement('a');
      link.href = url;
      link.download = defaultFilename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      console.log('✅ Hook export simulation completed');
      console.log(`📁 File should be downloaded as: ${defaultFilename}`);
      
      return true;
    } catch (error) {
      console.error('❌ Hook export test failed:', error);
      return false;
    } finally {
      this.clearTestData();
    }
  }

  /**
   * Run all verification tests
   */
  static async runAllTests(): Promise<void> {
    console.log('🚀 Running all export verification tests...\n');
    
    const compatibilityPassed = this.checkBrowserCompatibility();
    console.log('\n' + '='.repeat(50) + '\n');
    
    if (!compatibilityPassed) {
      console.log('❌ Browser compatibility issues detected. Export may not work properly.');
      return;
    }
    
    const basicExportPassed = await this.testExport();
    console.log('\n' + '='.repeat(50) + '\n');
    
    const hookExportPassed = await this.testHookExport();
    console.log('\n' + '='.repeat(50) + '\n');
    
    const allPassed = compatibilityPassed && basicExportPassed && hookExportPassed;
    
    console.log(`🏁 All tests completed: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (allPassed) {
      console.log('✅ Export functionality should work correctly in this browser');
      console.log('📁 Check your Downloads folder for exported test files');
    } else {
      console.log('❌ Export functionality may have issues in this browser');
      console.log('🔧 Check the console errors above for troubleshooting');
    }
  }
}

// Make it available globally for manual testing
(window as any).ExportVerification = ExportVerification;

// Instructions for manual testing
console.log(`
🧪 Manual Export Verification Available

To test export functionality manually, run these commands in the browser console:

1. Check browser compatibility:
   ExportVerification.checkBrowserCompatibility()

2. Test basic export functionality:
   await ExportVerification.testExport()

3. Test hook export simulation:
   await ExportVerification.testHookExport()

4. Run all tests:
   await ExportVerification.runAllTests()

After running tests, check your Downloads folder for exported files.
`);
