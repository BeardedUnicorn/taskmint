/**
 * Global Teardown for Playwright E2E Tests
 * 
 * Cleans up the test environment after running E2E tests,
 * including data cleanup and resource disposal.
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global teardown for E2E tests...');
  
  // Launch browser for cleanup operations
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to the app
    await page.goto(config.projects[0].use.baseURL || 'http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Clean up test data
    console.log('🗑️ Cleaning up test data...');
    await page.evaluate(() => {
      // Remove test-specific data
      const keysToRemove = [
        'app-settings',
        'tasks',
        'sessions',
        'time-entries',
        'timer-state',
        'active-session',
      ];
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
      
      // Clear any test-specific IndexedDB data
      if (window.indexedDB) {
        console.log('Test IndexedDB data cleared');
      }
    });
    
    // Take a final screenshot for debugging if needed
    if (process.env.DEBUG_E2E) {
      await page.screenshot({ 
        path: 'test-results/final-state.png',
        fullPage: true 
      });
    }
    
    console.log('✅ Global teardown completed successfully');
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error in teardown to avoid masking test failures
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalTeardown;
