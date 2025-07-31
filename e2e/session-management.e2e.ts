/**
 * E2E Tests for Session Management
 * 
 * Comprehensive end-to-end tests for session-based timer functionality
 * including session creation, management, and timer operations.
 */

import { test, expect, Page } from '@playwright/test';

// Test data
const TEST_TASKS = {
  task1: 'E2E Test Task 1',
  task2: 'E2E Test Task 2',
  customTask: 'Custom E2E Task',
};

// Helper functions
async function navigateToSessions(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Navigate to Sessions page if not already there
  const sessionsLink = page.locator('nav').getByText('Sessions');
  if (await sessionsLink.isVisible()) {
    await sessionsLink.click();
    await page.waitForLoadState('networkidle');
  }
}

async function createSession(page: Page, taskName: string) {
  // Fill in task name
  const taskInput = page.getByPlaceholder('Select or enter task name...');
  await taskInput.fill(taskName);
  
  // Start session
  const startButton = page.getByRole('button', { name: /start.*session/i });
  await startButton.click();
  
  // Wait for session to be created
  await page.waitForTimeout(1000);
}

async function waitForTimerUpdate(page: Page, expectedPattern: RegExp) {
  await expect(page.locator('[data-testid="timer-display"]')).toHaveText(expectedPattern, {
    timeout: 10000,
  });
}

test.describe('Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToSessions(page);
  });

  test('should display empty sessions state initially', async ({ page }) => {
    // Check for empty state
    await expect(page.getByText('No sessions found')).toBeVisible();
    await expect(page.getByText('Start your first session')).toBeVisible();
    
    // Check that start button is disabled without task
    const startButton = page.getByRole('button', { name: /start.*session/i });
    await expect(startButton).toBeDisabled();
  });

  test('should create a new session with predefined task', async ({ page }) => {
    await createSession(page, TEST_TASKS.task1);
    
    // Verify session was created
    await expect(page.getByText(TEST_TASKS.task1)).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
    
    // Verify timer is running
    await expect(page.locator('[data-testid="timer-display"]')).toBeVisible();
    await waitForTimerUpdate(page, /\d{2}:\d{2}:\d{2}/);
  });

  test('should create a new session with custom task name', async ({ page }) => {
    await createSession(page, TEST_TASKS.customTask);
    
    // Verify session was created with custom task
    await expect(page.getByText(TEST_TASKS.customTask)).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
  });

  test('should display multiple sessions', async ({ page }) => {
    // Create first session
    await createSession(page, TEST_TASKS.task1);
    
    // End the session
    const endButton = page.getByRole('button', { name: /end session/i });
    await endButton.click();
    
    // Create second session
    await createSession(page, TEST_TASKS.task2);
    
    // Verify both sessions are displayed
    await expect(page.getByText(TEST_TASKS.task1)).toBeVisible();
    await expect(page.getByText(TEST_TASKS.task2)).toBeVisible();
    
    // Verify only the second session is active
    const activeIndicators = page.locator('[data-testid="active-indicator"]');
    await expect(activeIndicators).toHaveCount(1);
  });

  test('should activate and deactivate sessions', async ({ page }) => {
    // Create and end a session
    await createSession(page, TEST_TASKS.task1);
    await page.getByRole('button', { name: /end session/i }).click();
    
    // Activate the session
    const sessionCard = page.getByText(TEST_TASKS.task1).locator('..');
    await sessionCard.getByRole('button', { name: /activate/i }).click();
    
    // Verify session is active
    await expect(page.getByText('Active')).toBeVisible();
    
    // Deactivate the session
    await page.getByRole('button', { name: /deactivate/i }).click();
    
    // Verify session is no longer active
    await expect(page.getByText('Active')).not.toBeVisible();
  });

  test('should delete a session', async ({ page }) => {
    // Create a session
    await createSession(page, TEST_TASKS.task1);
    await page.getByRole('button', { name: /end session/i }).click();
    
    // Delete the session
    const sessionCard = page.getByText(TEST_TASKS.task1).locator('..');
    await sessionCard.getByRole('button', { name: /delete/i }).click();
    
    // Confirm deletion
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Verify session is deleted
    await expect(page.getByText(TEST_TASKS.task1)).not.toBeVisible();
    await expect(page.getByText('No sessions found')).toBeVisible();
  });
});

test.describe('Timer Operations', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToSessions(page);
  });

  test('should start and stop timer', async ({ page }) => {
    await createSession(page, TEST_TASKS.task1);
    
    // Verify timer is running
    await waitForTimerUpdate(page, /00:00:0[1-9]/);
    
    // Stop the timer
    await page.getByRole('button', { name: /stop/i }).click();
    
    // Verify timer stopped
    await expect(page.getByRole('button', { name: /start/i })).toBeVisible();
  });

  test('should pause and resume timer', async ({ page }) => {
    await createSession(page, TEST_TASKS.task1);
    
    // Wait for timer to start
    await waitForTimerUpdate(page, /00:00:0[1-9]/);
    
    // Pause the timer
    await page.getByRole('button', { name: /pause/i }).click();
    
    // Verify timer is paused
    await expect(page.getByRole('button', { name: /resume/i })).toBeVisible();
    await expect(page.getByText('Paused')).toBeVisible();
    
    // Resume the timer
    await page.getByRole('button', { name: /resume/i }).click();
    
    // Verify timer is running again
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
  });

  test('should create multiple timer instances', async ({ page }) => {
    await createSession(page, TEST_TASKS.task1);
    
    // Add another timer instance
    await page.getByRole('button', { name: /add timer/i }).click();
    
    // Verify multiple timer instances
    const timerInstances = page.locator('[data-testid="timer-instance"]');
    await expect(timerInstances).toHaveCount(2);
    
    // Verify each timer has its own controls
    const startButtons = page.locator('[data-testid="timer-instance"] button:has-text("Start")');
    const pauseButtons = page.locator('[data-testid="timer-instance"] button:has-text("Pause")');
    
    await expect(startButtons.or(pauseButtons)).toHaveCount(2);
  });

  test('should track timer duration accurately', async ({ page }) => {
    await createSession(page, TEST_TASKS.task1);
    
    // Wait for timer to run for a few seconds
    await waitForTimerUpdate(page, /00:00:0[3-9]/);
    
    // Stop the timer
    await page.getByRole('button', { name: /stop/i }).click();
    
    // Verify duration is recorded
    const durationText = await page.locator('[data-testid="session-duration"]').textContent();
    expect(durationText).toMatch(/00:00:0[3-9]/);
  });
});

test.describe('Session Persistence', () => {
  test('should persist session state across page refreshes', async ({ page }) => {
    await navigateToSessions(page);
    await createSession(page, TEST_TASKS.task1);
    
    // Wait for timer to start
    await waitForTimerUpdate(page, /00:00:0[1-9]/);
    
    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Verify session and timer state are restored
    await expect(page.getByText(TEST_TASKS.task1)).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
    await expect(page.locator('[data-testid="timer-display"]')).toBeVisible();
  });

  test('should persist session data across navigation', async ({ page }) => {
    await navigateToSessions(page);
    await createSession(page, TEST_TASKS.task1);
    
    // Navigate to another page
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');
    
    // Navigate back to sessions
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    // Verify session is still there
    await expect(page.getByText(TEST_TASKS.task1)).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
  });
});

test.describe('Session Integration', () => {
  test('should sync with global timer', async ({ page }) => {
    // Start from dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Start global timer
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill(TEST_TASKS.task1);
    await page.getByRole('button', { name: /start/i }).click();
    
    // Navigate to sessions
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    // Verify session was created automatically
    await expect(page.getByText(TEST_TASKS.task1)).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
  });

  test('should update dashboard when session timer runs', async ({ page }) => {
    await navigateToSessions(page);
    await createSession(page, TEST_TASKS.task1);
    
    // Wait for timer to run
    await waitForTimerUpdate(page, /00:00:0[3-9]/);
    
    // Navigate to dashboard
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');
    
    // Verify dashboard shows active timer
    await expect(page.getByText(TEST_TASKS.task1)).toBeVisible();
    await expect(page.locator('[data-testid="timer-display"]')).toBeVisible();
  });
});
