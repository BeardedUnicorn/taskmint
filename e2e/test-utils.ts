/**
 * E2E Test Utilities
 * 
 * Shared utilities and helper functions for Playwright E2E tests.
 * Provides common operations, assertions, and test data management.
 */

import { Page, expect, Locator } from '@playwright/test';

// Test data constants
export const TEST_TASKS = {
  development: 'Development Work',
  codeReview: 'Code Review',
  documentation: 'Documentation',
  bugFixes: 'Bug Fixes',
  testing: 'Testing',
  meeting: 'Team Meeting',
} as const;

export const TEST_NOTES = {
  simple: 'Simple test note for E2E testing',
  detailed: 'Detailed test note with multiple lines\nand comprehensive content for testing',
  template: 'Template-based note content',
} as const;

// Navigation helpers
export class NavigationHelper {
  constructor(private page: Page) {}

  async goToPage(pageName: 'Dashboard' | 'Sessions' | 'Tasks' | 'Notes') {
    await this.page.getByText(pageName).click();
    await this.page.waitForLoadState('networkidle');
  }

  async goToSessions() {
    await this.goToPage('Sessions');
  }

  async goToDashboard() {
    await this.goToPage('Dashboard');
  }

  async goToTasks() {
    await this.goToPage('Tasks');
  }

  async goToNotes() {
    await this.goToPage('Notes');
  }
}

// Timer helpers
export class TimerHelper {
  constructor(private page: Page) {}

  async startGlobalTimer(taskName: string) {
    const taskInput = this.page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill(taskName);

    const startButton = this.page.getByRole('button', { name: /start/i });
    await startButton.click();

    await expect(this.page.getByRole('button', { name: /pause|stop/i })).toBeVisible();
  }

  async stopGlobalTimer() {
    const stopButton = this.page.getByRole('button', { name: /stop/i });
    await stopButton.click();
  }

  async pauseGlobalTimer() {
    const pauseButton = this.page.getByRole('button', { name: /pause/i });
    await pauseButton.click();
  }

  async resumeGlobalTimer() {
    const resumeButton = this.page.getByRole('button', { name: /resume/i });
    await resumeButton.click();
  }

  async waitForTimerDisplay(pattern: RegExp, timeout = 10000) {
    await expect(this.page.locator('[data-testid="timer-display"]')).toHaveText(pattern, {
      timeout,
    });
  }

  async getTimerDisplay(): Promise<string> {
    return await this.page.locator('[data-testid="timer-display"]').textContent() || '';
  }

  async isTimerRunning(): Promise<boolean> {
    return await this.page.getByRole('button', { name: /pause|stop/i }).isVisible();
  }

  async isTimerPaused(): Promise<boolean> {
    return await this.page.getByRole('button', { name: /resume/i }).isVisible();
  }
}

// Session helpers
export class SessionHelper {
  constructor(private page: Page) {}

  async createSession(taskName: string) {
    const taskInput = this.page.getByPlaceholder('Select or enter task name...');
    await taskInput.fill(taskName);
    
    const startButton = this.page.getByRole('button', { name: /start.*session/i });
    await startButton.click();

    await expect(this.page.getByText(taskName)).toBeVisible();
    await expect(this.page.getByText('Active')).toBeVisible();
  }

  async endSession() {
    const endButton = this.page.getByRole('button', { name: /end session/i });
    await endButton.click();
  }

  async activateSession(taskName: string) {
    const sessionCard = this.page.getByText(taskName).locator('..');
    await sessionCard.getByRole('button', { name: /activate/i }).click();
  }

  async deactivateSession() {
    const deactivateButton = this.page.getByRole('button', { name: /deactivate/i });
    await deactivateButton.click();
  }

  async deleteSession(taskName: string) {
    const sessionCard = this.page.getByText(taskName).locator('..');
    await sessionCard.getByRole('button', { name: /delete/i }).click();
    
    // Confirm deletion
    await this.page.getByRole('button', { name: /confirm/i }).click();
  }

  async addTimerInstance() {
    const addTimerButton = this.page.getByRole('button', { name: /add timer/i });
    await addTimerButton.click();
  }

  async getSessionCard(taskName: string): Promise<Locator> {
    return this.page.getByText(taskName).locator('..');
  }

  async isSessionActive(taskName: string): Promise<boolean> {
    const sessionCard = await this.getSessionCard(taskName);
    return await sessionCard.getByText('Active').isVisible();
  }

  async getSessionDuration(taskName: string): Promise<string> {
    const sessionCard = await this.getSessionCard(taskName);
    return await sessionCard.locator('[data-testid="session-duration"]').textContent() || '';
  }
}

// Notes helpers
export class NotesHelper {
  constructor(private page: Page) {}

  async openNotesDialog() {
    const notesButton = this.page.getByRole('button', { name: /notes/i }).first();
    await notesButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async closeNotesDialog() {
    const closeButton = this.page.getByRole('button', { name: /close/i });
    await closeButton.click();
  }

  async createNote(content: string, useTemplate = false) {
    const addNoteButton = this.page.getByRole('button', { name: /add note/i });
    await addNoteButton.click();
    
    if (useTemplate) {
      const templateSelect = this.page.locator('[data-testid="template-select"]');
      if (await templateSelect.isVisible()) {
        await templateSelect.click();
        await this.page.getByText('Test Template').click();
      }
    }
    
    const noteTextarea = this.page.getByPlaceholder(/enter.*note/i);
    await noteTextarea.fill(content);
    
    const saveButton = this.page.getByRole('button', { name: /save.*note/i });
    await saveButton.click();
    await expect(this.page.getByText(content)).toBeVisible();
  }

  async editNote(originalContent: string, newContent: string) {
    const noteCard = this.page.getByText(originalContent).locator('..');
    await noteCard.getByRole('button', { name: /edit/i }).click();
    
    const noteTextarea = this.page.getByPlaceholder(/enter.*note/i);
    await noteTextarea.clear();
    await noteTextarea.fill(newContent);
    
    const saveButton = this.page.getByRole('button', { name: /save.*note/i });
    await saveButton.click();
  }

  async deleteNote(content: string) {
    const noteCard = this.page.getByText(content).locator('..');
    await noteCard.getByRole('button', { name: /delete/i }).click();
    
    await this.page.getByRole('button', { name: /confirm/i }).click();
  }

  async searchNotes(searchTerm: string) {
    const searchInput = this.page.getByPlaceholder(/search.*notes/i);
    await searchInput.fill(searchTerm);
  }

  async filterNotesByTask(taskName: string) {
    const taskFilter = this.page.locator('[data-testid="task-filter"]');
    await taskFilter.click();
    await this.page.getByText(taskName).click();
  }

  async getNoteCount(): Promise<number> {
    const noteCards = this.page.locator('[data-testid="note-card"]');
    return await noteCards.count();
  }

  async isNoteVisible(content: string): Promise<boolean> {
    return await this.page.getByText(content).isVisible();
  }
}

// Settings helpers
export class SettingsHelper {
  constructor(private page: Page) {}

  async setInactivitySettings(thresholdMinutes: number, warningSeconds: number, enabled = true) {
    await this.page.evaluate((config) => {
      const settings = {
        inactivityDetection: {
          enabled: config.enabled,
          thresholdMinutes: config.threshold,
          warningDurationSeconds: config.warning,
          autoSave: true,
        }
      };
      localStorage.setItem('inactivity-settings', JSON.stringify(settings));
    }, { enabled, threshold: thresholdMinutes, warning: warningSeconds });
  }

  async clearAllData() {
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }

  async setTestData() {
    await this.page.evaluate(() => {
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
  }
}

// Assertion helpers
export class AssertionHelper {
  constructor(private page: Page) {}

  async expectTimerToBeRunning() {
    await expect(this.page.getByRole('button', { name: /pause|stop/i })).toBeVisible();
  }

  async expectTimerToBePaused() {
    await expect(this.page.getByRole('button', { name: /resume/i })).toBeVisible();
    await expect(this.page.getByText(/paused/i)).toBeVisible();
  }

  async expectTimerToBeStopped() {
    await expect(this.page.getByRole('button', { name: /start/i })).toBeVisible();
  }

  async expectSessionToBeActive(taskName: string) {
    await expect(this.page.getByText(taskName)).toBeVisible();
    await expect(this.page.getByText('Active')).toBeVisible();
  }

  async expectSessionToBeInactive(taskName: string) {
    await expect(this.page.getByText(taskName)).toBeVisible();
    await expect(this.page.getByText('Active')).not.toBeVisible();
  }

  async expectNoteToExist(content: string) {
    await expect(this.page.getByText(content)).toBeVisible();
  }

  async expectNoteNotToExist(content: string) {
    await expect(this.page.getByText(content)).not.toBeVisible();
  }

  async expectInactivityWarning() {
    await expect(this.page.getByText(/inactivity detected/i)).toBeVisible();
  }

  async expectNoInactivityWarning() {
    await expect(this.page.getByText(/inactivity detected/i)).not.toBeVisible();
  }
}

// Combined helper class
export class E2ETestHelper {
  public navigation: NavigationHelper;
  public timer: TimerHelper;
  public session: SessionHelper;
  public notes: NotesHelper;
  public settings: SettingsHelper;
  public assert: AssertionHelper;

  constructor(private page: Page) {
    this.navigation = new NavigationHelper(page);
    this.timer = new TimerHelper(page);
    this.session = new SessionHelper(page);
    this.notes = new NotesHelper(page);
    this.settings = new SettingsHelper(page);
    this.assert = new AssertionHelper(page);
  }

  async setup() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
    await this.settings.setTestData();
  }

  async cleanup() {
    await this.settings.clearAllData();
  }
}

// Utility functions
export async function waitForStableTimer(page: Page, minDuration = 2000) {
  const start = parseDuration(
    (await page.locator('[data-testid="timer-display"]').textContent()) || '00:00:00'
  );
  await expect.poll(async () => {
    const current = parseDuration(
      (await page.locator('[data-testid="timer-display"]').textContent()) || '00:00:00'
    );
    return current - start;
  }).toBeGreaterThanOrEqual(minDuration / 1000);
}

export async function simulateUserActivity(page: Page) {
  await page.mouse.move(100, 100);
  await page.mouse.move(200, 200);
}

export async function simulateInactivity(page: Page, durationMs: number) {
  await page.evaluate((duration) => {
    return new Promise(resolve => {
      setTimeout(resolve, duration);
    });
  }, durationMs);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function parseDuration(timeString: string): number {
  const parts = timeString.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}
