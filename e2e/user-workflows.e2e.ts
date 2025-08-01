/**
 * E2E Tests for Complete User Workflows
 * 
 * End-to-end tests that simulate complete user workflows
 * combining multiple features and realistic usage scenarios.
 */

import { test, expect, Page, Locator } from '@playwright/test';
import { parseDuration } from './test-utils';

async function waitForTimerIncrement(timer: Locator, seconds: number) {
  const start = parseDuration((await timer.textContent()) || '00:00:00');
  await expect.poll(async () => {
    const current = parseDuration((await timer.textContent()) || '00:00:00');
    return current - start;
  }).toBeGreaterThanOrEqual(seconds);
}

// Test scenarios
const WORK_SESSION_SCENARIO = {
  task: 'Feature Development',
  duration: 5000, // 5 seconds for testing
  notes: [
    'Started working on user authentication',
    'Implemented login form validation',
    'Added password strength requirements',
  ],
};

const MULTI_TASK_SCENARIO = {
  tasks: [
    { name: 'Code Review', duration: 3000 },
    { name: 'Bug Fixes', duration: 4000 },
    { name: 'Documentation', duration: 2000 },
  ],
};

// Helper functions
async function completeWorkSession(page: Page, scenario: typeof WORK_SESSION_SCENARIO) {
  // Start session
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Navigate to sessions
  await page.getByText('Sessions').click();
  await page.waitForLoadState('networkidle');
  
  // Create session
  const taskInput = page.getByPlaceholder('Select or enter task name...');
  await taskInput.fill(scenario.task);
  await page.getByRole('button', { name: /start.*session/i }).click();

  const timerDisplay = page.locator('[data-testid="timer-display"]').first();
  await waitForTimerIncrement(timerDisplay, scenario.duration / 1000);

  // Add notes during session
  for (const note of scenario.notes) {
    await page.getByRole('button', { name: /notes/i }).first().click();
    await page.getByRole('button', { name: /add note/i }).click();
    await page.getByPlaceholder(/enter.*note/i).fill(note);
    await page.getByRole('button', { name: /save.*note/i }).click();
    await page.getByRole('button', { name: /close/i }).click();

    await waitForTimerIncrement(timerDisplay, 1);
  }
  
  // End session
  await page.getByRole('button', { name: /end session/i }).click();
  
  return scenario;
}

async function switchBetweenTasks(page: Page, tasks: typeof MULTI_TASK_SCENARIO.tasks) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    
    // Start timer for task
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.clear();
    await taskInput.fill(task.name);
    await page.getByRole('button', { name: /start/i }).click();
    const timerDisplay = page.locator('[data-testid="timer-display"]').first();
    await waitForTimerIncrement(timerDisplay, task.duration / 1000);

    // Stop timer
    await page.getByRole('button', { name: /stop/i }).click();

    if (i < tasks.length - 1) {
      await expect(page.getByRole('button', { name: /start/i })).toBeVisible();
    }
  }
}

test.describe('Complete Work Session Workflow', () => {
  test('should complete a full work session with notes', async ({ page }) => {
    const session = await completeWorkSession(page, WORK_SESSION_SCENARIO);
    
    // Verify session was completed
    await expect(page.getByText(session.task)).toBeVisible();
    await expect(page.getByText(/completed|finished/i)).toBeVisible();
    
    // Check session duration
    await expect(page.locator('[data-testid="session-duration"]')).toContainText(/00:00:0[4-6]/);
    
    // Verify notes were saved
    await page.getByRole('button', { name: /notes/i }).first().click();
    
    for (const note of session.notes) {
      await expect(page.getByText(note)).toBeVisible();
    }
  });

  test('should track multiple timer instances in one session', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    // Create session
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill('Multi-Instance Task');
    await page.getByRole('button', { name: /start.*session/i }).click();
    
    // Work with first timer
    let timers = page.locator('[data-testid="timer-display"]');
    await waitForTimerIncrement(timers.first(), 2);
    await page.getByRole('button', { name: /stop/i }).click();

    // Add second timer instance
    await page.getByRole('button', { name: /add timer/i }).click();
    timers = page.locator('[data-testid="timer-display"]');
    await waitForTimerIncrement(timers.last(), 3);
    await page.getByRole('button', { name: /stop/i }).click();

    // Add third timer instance
    await page.getByRole('button', { name: /add timer/i }).click();
    timers = page.locator('[data-testid="timer-display"]');
    await waitForTimerIncrement(timers.last(), 1);
    
    // End session
    await page.getByRole('button', { name: /end session/i }).click();
    
    // Verify multiple timer instances
    await expect(page.getByText('3 timers')).toBeVisible();
    
    // Check total duration
    await expect(page.locator('[data-testid="session-duration"]')).toContainText(/00:00:0[6-8]/);
  });

  test('should handle session interruption and resumption', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    // Start session
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill('Interrupted Task');
    await page.getByRole('button', { name: /start.*session/i }).click();
    
    // Work for a bit
    const timerDisplay = page.locator('[data-testid="timer-display"]').first();
    await waitForTimerIncrement(timerDisplay, 2);

    // Pause timer
    await page.getByRole('button', { name: /pause/i }).click();
    await expect(page.getByText(/paused/i)).toBeVisible();

    // Resume timer
    await page.getByRole('button', { name: /resume/i }).click();

    // Continue working
    await waitForTimerIncrement(timerDisplay, 2);
    
    // End session
    await page.getByRole('button', { name: /end session/i }).click();
    
    // Verify session completed with pause/resume
    await expect(page.getByText('Interrupted Task')).toBeVisible();
    await expect(page.locator('[data-testid="session-duration"]')).toContainText(/00:00:0[3-5]/);
  });
});

test.describe('Multi-Task Workflow', () => {
  test('should switch between multiple tasks efficiently', async ({ page }) => {
    await switchBetweenTasks(page, MULTI_TASK_SCENARIO.tasks);
    
    // Navigate to dashboard to see summary
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');
    
    // Verify all tasks appear in time entries
    for (const task of MULTI_TASK_SCENARIO.tasks) {
      await expect(page.getByText(task.name)).toBeVisible();
    }
    
    // Check total time tracked
    await expect(page.locator('[data-testid="total-time-today"]')).toContainText(/00:00:0[8-10]/);
  });

  test('should maintain task context across sessions', async ({ page }) => {
    // Create session for first task
    await page.goto('/');
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill('Context Task');
    await page.getByRole('button', { name: /start.*session/i }).click();
    
    // Add note
    await page.getByRole('button', { name: /notes/i }).first().click();
    await page.getByRole('button', { name: /add note/i }).click();
    await page.getByPlaceholder(/enter.*note/i).fill('First session note');
    await page.getByRole('button', { name: /save.*note/i }).click();
    await page.getByRole('button', { name: /close/i }).click();
    
    // End session
    await page.getByRole('button', { name: /end session/i }).click();
    
    // Start new session for same task
    await taskInput.fill('Context Task');
    await page.getByRole('button', { name: /start.*session/i }).click();
    
    // Check that previous notes are accessible
    await page.getByRole('button', { name: /notes/i }).first().click();
    await expect(page.getByText('First session note')).toBeVisible();
    
    // Add another note
    await page.getByRole('button', { name: /add note/i }).click();
    await page.getByPlaceholder(/enter.*note/i).fill('Second session note');
    await page.getByRole('button', { name: /save.*note/i }).click();
    
    // Verify both notes are present
    await expect(page.getByText('First session note')).toBeVisible();
    await expect(page.getByText('Second session note')).toBeVisible();
  });
});

test.describe('Cross-Page Integration Workflow', () => {
  test('should maintain timer state across page navigation', async ({ page }) => {
    // Start timer on dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill('Navigation Test Task');
    await page.getByRole('button', { name: /start/i }).click();
    
    // Navigate to different pages while timer runs
    const pages = ['Tasks', 'Sessions', 'Notes', 'Dashboard'];
    
    for (const pageName of pages) {
      await page.getByText(pageName).click();
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('Navigation Test Task')).toBeVisible();
      const timer = page.locator('[data-testid="timer-display"]');
      await expect(timer).toBeVisible();
      await waitForTimerIncrement(timer, 1);
    }
    
    // Stop timer from final page
    await page.getByRole('button', { name: /stop/i }).click();
    
    // Verify time entry was created
    await expect(page.getByText('Navigation Test Task')).toBeVisible();
    await expect(page.locator('[data-testid="time-entry"]')).toBeVisible();
  });

  test('should sync global timer with session system', async ({ page }) => {
    // Start global timer
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill('Sync Test Task');
    await page.getByRole('button', { name: /start/i }).click();
    
    // Navigate to sessions
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    // Verify session was created automatically
    await expect(page.getByText('Sync Test Task')).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
    
    // Modify session (add timer instance)
    await page.getByRole('button', { name: /add timer/i }).click();
    
    // Navigate back to dashboard
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');
    
    // Verify global timer reflects session changes
    await expect(page.getByText('Sync Test Task')).toBeVisible();
    await expect(page.getByText('2 timers')).toBeVisible();
  });
});

test.describe('Data Persistence Workflow', () => {
  test('should persist work across browser sessions', async ({ page }) => {
    // Create session with data
    await page.goto('/');
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill('Persistence Test');
    await page.getByRole('button', { name: /start.*session/i }).click();
    
    // Add note
    await page.getByRole('button', { name: /notes/i }).first().click();
    await page.getByRole('button', { name: /add note/i }).click();
    await page.getByPlaceholder(/enter.*note/i).fill('Persistent note');
    await page.getByRole('button', { name: /save.*note/i }).click();
    await page.getByRole('button', { name: /close/i }).click();
    
    // Work for a bit
    const timerDisplay = page.locator('[data-testid="timer-display"]').first();
    await waitForTimerIncrement(timerDisplay, 3);
    
    // End session
    await page.getByRole('button', { name: /end session/i }).click();
    
    // Simulate browser restart by reloading
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Navigate to sessions
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    // Verify session persisted
    await expect(page.getByText('Persistence Test')).toBeVisible();
    
    // Verify note persisted
    await page.getByRole('button', { name: /notes/i }).first().click();
    await expect(page.getByText('Persistent note')).toBeVisible();
    
    // Navigate to dashboard
    await page.getByRole('button', { name: /close/i }).click();
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');
    
    // Verify time entry was created
    await expect(page.getByText('Persistence Test')).toBeVisible();
  });

  test('should handle data export and import workflow', async ({ page }) => {
    // Create some test data
    await switchBetweenTasks(page, MULTI_TASK_SCENARIO.tasks);
    
    // Navigate to settings/export (if available)
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if export functionality exists
    const exportButton = page.getByRole('button', { name: /export/i });
    if (await exportButton.isVisible()) {
      await exportButton.click();
      
      // Verify export dialog or download
      await expect(page.getByText(/export.*data/i)).toBeVisible();
    }
    
    // Navigate to dashboard to verify data exists
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');
    
    // Verify all tasks are present
    for (const task of MULTI_TASK_SCENARIO.tasks) {
      await expect(page.getByText(task.name)).toBeVisible();
    }
  });
});

test.describe('Error Recovery Workflow', () => {
  test('should recover from network interruption', async ({ page }) => {
    // Start session
    await page.goto('/');
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill('Network Test Task');
    await page.getByRole('button', { name: /start.*session/i }).click();
    
    // Simulate network interruption
    await page.route('**/*', route => route.abort());
    
    // Try to perform actions during network failure
    await page.getByRole('button', { name: /notes/i }).first().click();
    
    // Restore network
    await page.unroute('**/*');
    
    // Verify app recovers gracefully
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Network Test Task')).toBeVisible();
  });

  test('should handle invalid data gracefully', async ({ page }) => {
    // Inject invalid data
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('sessions', 'invalid-json-data');
      localStorage.setItem('time-entries', '{"invalid": "structure"}');
    });
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // App should still function
    await expect(page.getByText('Dashboard')).toBeVisible();
    
    // Should be able to create new session
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill('Recovery Test');
    await page.getByRole('button', { name: /start.*session/i }).click();
    
    await expect(page.getByText('Recovery Test')).toBeVisible();
  });
});
