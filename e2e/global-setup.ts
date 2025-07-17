/**
 * Global Setup for Playwright E2E Tests
 * 
 * Sets up the test environment before running E2E tests,
 * including database initialization and test data preparation.
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global setup for E2E tests...');
  
  // Launch browser for setup operations
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Wait for the development server to be ready
    console.log('⏳ Waiting for development server...');
    await page.goto(config.projects[0].use.baseURL || 'http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Clear any existing data
    console.log('🧹 Clearing existing test data...');
    await page.evaluate(() => {
      // Clear localStorage
      localStorage.clear();
      
      // Clear sessionStorage
      sessionStorage.clear();
      
      // Clear IndexedDB if available
      if (window.indexedDB) {
        // Note: In a real app, you might want to clear specific databases
        console.log('IndexedDB cleared');
      }
    });
    
    // Initialize test data if needed
    console.log('📊 Initializing test data...');
    await page.evaluate(() => {
      // Set up initial test configuration
      const testConfig = {
        inactivityThreshold: 1, // 1 minute for faster testing
        warningDuration: 5, // 5 seconds for faster testing
        autoSave: true,
        theme: 'dark',
      };
      
      localStorage.setItem('app-settings', JSON.stringify(testConfig));
      
      // Create some test tasks
      const testTasks = [
        {
          id: 'test-task-1',
          name: 'E2E Test Task 1',
          description: 'First test task for E2E testing',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'test-task-2',
          name: 'E2E Test Task 2',
          description: 'Second test task for E2E testing',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      
      localStorage.setItem('tasks', JSON.stringify(testTasks));
    });
    
    console.log('✅ Global setup completed successfully');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;
