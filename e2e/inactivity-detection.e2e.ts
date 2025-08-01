/**
 * E2E Tests for Inactivity Detection
 * 
 * Comprehensive end-to-end tests for automatic inactivity-based
 * timer pausing with configurable thresholds and warning dialogs.
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
const SHORT_INACTIVITY_THRESHOLD = 10; // 10 seconds for testing
const WARNING_DURATION = 5; // 5 seconds warning

// Helper functions
async function setupInactivitySettings(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Navigate to settings
  const settingsButton = page.getByRole('button', { name: /settings/i });
  if (await settingsButton.isVisible()) {
    await settingsButton.click();
  }
  
  // Configure inactivity settings for testing
  await page.evaluate((config) => {
    const settings = {
      inactivityDetection: {
        enabled: true,
        thresholdMinutes: config.threshold / 60, // Convert seconds to minutes
        warningDurationSeconds: config.warning,
        autoSave: true,
      }
    };
    localStorage.setItem('inactivity-settings', JSON.stringify(settings));
  }, { threshold: SHORT_INACTIVITY_THRESHOLD, warning: WARNING_DURATION });
}

async function startTimer(page: Page, taskName: string) {
  const taskInput = page.getByPlaceholder('Select or enter task name...');
  await taskInput.fill(taskName);

  const startButton = page.getByRole('button', { name: /start/i });
  await startButton.click();
  await expect(page.locator('[data-testid="timer-display"]')).toHaveText(/00:00:0[1-9]/);
}

async function simulateInactivity(page: Page, durationMs: number) {
  // Stop all mouse and keyboard activity
  await page.evaluate((duration) => {
    return new Promise(resolve => {
      // Disable all activity events temporarily
      const originalAddEventListener = document.addEventListener;
      document.addEventListener = () => {}; // Block new listeners
      
      setTimeout(() => {
        document.addEventListener = originalAddEventListener;
        resolve(undefined);
      }, duration);
    });
  }, durationMs);
}

async function triggerActivity(page: Page) {
  // Simulate user activity
  await page.mouse.move(100, 100);
  await page.mouse.move(200, 200);
}

test.describe('Inactivity Detection Setup', () => {
  test('should configure inactivity detection settings', async ({ page }) => {
    await setupInactivitySettings(page);
    
    // Verify settings were applied
    const settings = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('inactivity-settings') || '{}');
    });
    
    expect(settings.inactivityDetection.enabled).toBe(true);
    expect(settings.inactivityDetection.thresholdMinutes).toBe(SHORT_INACTIVITY_THRESHOLD / 60);
  });

  test('should enable/disable inactivity detection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Test with inactivity detection disabled
    await page.evaluate(() => {
      const settings = {
        inactivityDetection: { enabled: false }
      };
      localStorage.setItem('inactivity-settings', JSON.stringify(settings));
    });
    
    await startTimer(page, 'Test Task');
    
    // Simulate inactivity - should not trigger warning
    await simulateInactivity(page, (SHORT_INACTIVITY_THRESHOLD + 2) * 1000);
    
    // Verify no warning dialog appears
    await expect(page.getByText(/inactivity detected/i)).not.toBeVisible();
  });
});

test.describe('Inactivity Warning Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await setupInactivitySettings(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should show warning dialog after inactivity threshold', async ({ page }) => {
    await startTimer(page, 'Inactivity Test Task');
    
    // Simulate inactivity for threshold duration
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    
    // Wait for warning dialog to appear
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 15000 });
    
    // Verify dialog content
    await expect(page.getByText(/no activity detected/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /continue working/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /pause timer/i })).toBeVisible();
  });

  test('should show countdown in warning dialog', async ({ page }) => {
    await startTimer(page, 'Countdown Test Task');
    
    // Trigger inactivity warning
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    
    // Wait for warning dialog
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 15000 });
    
    // Check for countdown display
    await expect(page.getByText(/\d+s/)).toBeVisible();
    
    // Verify countdown decreases
     const initialCountdown = await page.locator('[data-testid="countdown-display"]').textContent();
     await expect.poll(async () =>
       parseInt((await page.locator('[data-testid="countdown-display"]').textContent()) || '0')
     ).toBeLessThan(parseInt(initialCountdown || '0'));
     });

  test('should show progress bar in warning dialog', async ({ page }) => {
    await startTimer(page, 'Progress Test Task');
    
    // Trigger warning
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 15000 });
    
    // Verify progress bar
    const progressBar = page.getByRole('progressbar');
    await expect(progressBar).toBeVisible();
    
    // Check progress value
    const progressValue = await progressBar.getAttribute('aria-valuenow');
    expect(parseInt(progressValue || '0')).toBeGreaterThan(0);
  });
});

test.describe('Warning Dialog Actions', () => {
  test.beforeEach(async ({ page }) => {
    await setupInactivitySettings(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await startTimer(page, 'Action Test Task');
  });

  test('should continue timer when "Continue Working" is clicked', async ({ page }) => {
    // Trigger warning
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 15000 });
    
    // Click Continue Working
    await page.getByRole('button', { name: /continue working/i }).click();
    
    // Verify dialog closes and timer continues
    await expect(page.getByText(/inactivity detected/i)).not.toBeVisible();
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
    
    // Verify timer is still running
    const timerDisplay = page.locator('[data-testid="timer-display"]');
    const initialTime = await timerDisplay.textContent();
    await expect.poll(async () => await timerDisplay.textContent()).not.toBe(initialTime);
  });

  test('should pause timer when "Pause Timer" is clicked', async ({ page }) => {
    // Trigger warning
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 15000 });
    
    // Click Pause Timer
    await page.getByRole('button', { name: /pause timer/i }).click();
    
    // Verify dialog closes and timer is paused
    await expect(page.getByText(/inactivity detected/i)).not.toBeVisible();
    await expect(page.getByRole('button', { name: /resume/i })).toBeVisible();
    await expect(page.getByText(/paused/i)).toBeVisible();
  });

  test('should auto-pause timer if no action taken', async ({ page }) => {
    // Trigger warning
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 15000 });
    
    // Wait for warning duration to expire and dialog to close
    await expect(page.getByText(/inactivity detected/i)).not.toBeVisible({
      timeout: (WARNING_DURATION + 1) * 1000,
    });

    // Verify timer was auto-paused
    await expect(page.getByRole('button', { name: /resume/i })).toBeVisible();
    await expect(page.getByText(/paused/i)).toBeVisible();
  });
});

test.describe('Activity Detection', () => {
  test.beforeEach(async ({ page }) => {
    await setupInactivitySettings(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should reset inactivity timer on mouse movement', async ({ page }) => {
    await startTimer(page, 'Mouse Activity Test');
    
    // Simulate partial inactivity
    await simulateInactivity(page, (SHORT_INACTIVITY_THRESHOLD - 2) * 1000);
    
    // Trigger activity
    await triggerActivity(page);
    
    // Continue inactivity for remaining time
    await simulateInactivity(page, 4 * 1000);
    
    // Warning should not appear yet (timer was reset)
    await expect(page.getByText(/inactivity detected/i)).not.toBeVisible();
  });

  test('should reset inactivity timer on keyboard activity', async ({ page }) => {
    await startTimer(page, 'Keyboard Activity Test');
    
    // Simulate partial inactivity
    await simulateInactivity(page, (SHORT_INACTIVITY_THRESHOLD - 2) * 1000);
    
    // Trigger keyboard activity
    await page.keyboard.press('Space');
    
    // Continue inactivity
    await simulateInactivity(page, 4 * 1000);
    
    // Warning should not appear yet
    await expect(page.getByText(/inactivity detected/i)).not.toBeVisible();
  });

  test('should detect activity during warning dialog', async ({ page }) => {
    await startTimer(page, 'Warning Activity Test');
    
    // Trigger warning
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 15000 });
    
    // Trigger activity while warning is shown
    await triggerActivity(page);
    
    // Dialog should close automatically
    await expect(page.getByText(/inactivity detected/i)).not.toBeVisible({ timeout: 2000 });
    
    // Timer should continue running
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible();
  });
});

test.describe('Multiple Timer Instances', () => {
  test.beforeEach(async ({ page }) => {
    await setupInactivitySettings(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle inactivity with multiple running timers', async ({ page }) => {
    // Navigate to sessions and create session with multiple timers
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    // Create session
    const taskInput = page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill('Multi-Timer Test');
    await page.getByRole('button', { name: /start.*session/i }).click();
    
    // Add second timer
    await page.getByRole('button', { name: /add timer/i }).click();
    
    // Trigger inactivity
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    
    // Warning should appear
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 15000 });
    
    // Pause all timers
    await page.getByRole('button', { name: /pause timer/i }).click();
    
    // Verify all timers are paused
    const resumeButtons = page.locator('button:has-text("Resume")');
    await expect(resumeButtons).toHaveCount(2);
  });
});

test.describe('Inactivity Settings Integration', () => {
  test('should respect custom inactivity threshold', async ({ page }) => {
    // Set longer threshold
    const customThreshold = 20; // 20 seconds
    
    await page.goto('/');
    await page.evaluate((threshold) => {
      const settings = {
        inactivityDetection: {
          enabled: true,
          thresholdMinutes: threshold / 60,
          warningDurationSeconds: 5,
        }
      };
      localStorage.setItem('inactivity-settings', JSON.stringify(settings));
    }, customThreshold);
    
    await startTimer(page, 'Custom Threshold Test');
    
    // Simulate inactivity for original threshold (should not trigger)
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    await expect(page.getByText(/inactivity detected/i)).not.toBeVisible();
    
    // Simulate inactivity for custom threshold (should trigger)
    await simulateInactivity(page, (customThreshold - SHORT_INACTIVITY_THRESHOLD) * 1000);
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 5000 });
  });

  test('should respect custom warning duration', async ({ page }) => {
    const customWarning = 10; // 10 seconds
    
    await page.goto('/');
    await page.evaluate((config) => {
      const settings = {
        inactivityDetection: {
          enabled: true,
          thresholdMinutes: config.threshold / 60,
          warningDurationSeconds: config.warning,
        }
      };
      localStorage.setItem('inactivity-settings', JSON.stringify(settings));
    }, { threshold: SHORT_INACTIVITY_THRESHOLD, warning: customWarning });
    
    await startTimer(page, 'Custom Warning Test');
    
    // Trigger warning
    await simulateInactivity(page, SHORT_INACTIVITY_THRESHOLD * 1000);
    await expect(page.getByText(/inactivity detected/i)).toBeVisible({ timeout: 15000 });
    
    // Wait for custom warning duration and verify auto-pause
    await expect(page.getByRole('button', { name: /resume/i })).toBeVisible({
      timeout: (customWarning + 1) * 1000,
    });
  });
});
