/**
 * E2E Tests for Notes Functionality
 * 
 * Comprehensive end-to-end tests for hierarchical notes system
 * including timer notes, session notes, and task notes.
 */

import { test, expect, Page } from '@playwright/test';

// Test data
const TEST_TASK = 'Notes Test Task';
const TEST_NOTE_CONTENT = 'This is a test note created during E2E testing.';
const TEST_TEMPLATE_NOTE = 'Template-based note content for testing.';

// Helper functions
async function createSessionWithTimer(page: Page, taskName: string) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Navigate to Sessions if not already there
  const sessionsLink = page.locator('nav').getByText('Sessions');
  if (await sessionsLink.isVisible()) {
    await sessionsLink.click();
    await page.waitForLoadState('networkidle');
  }
  
  // Create session
  const taskInput = page.getByPlaceholder('Select or enter task name...');
  await taskInput.fill(taskName);
  
  const startButton = page.getByRole('button', { name: /start.*session/i });
  await startButton.click();
  await expect(page.getByText(taskName)).toBeVisible();
  await expect(page.getByText('Active')).toBeVisible();
}

async function openNotesDialog(page: Page) {
  const notesButton = page.getByRole('button', { name: /notes/i }).first();
  await notesButton.click();
  await page.waitForLoadState('networkidle');
}

async function createNote(page: Page, content: string, useTemplate = false) {
  // Click Add Note button
  const addNoteButton = page.getByRole('button', { name: /add note/i });
  await addNoteButton.click();
  
  if (useTemplate) {
    // Select a template if available
    const templateSelect = page.locator('[data-testid="template-select"]');
    if (await templateSelect.isVisible()) {
      await templateSelect.click();
      await page.getByText('Test Template').click();
    }
  }
  
  // Fill note content
  const noteTextarea = page.getByPlaceholder(/enter.*note/i);
  await noteTextarea.fill(content);
  
  // Save note
  const saveButton = page.getByRole('button', { name: /save.*note/i });
  await saveButton.click();
  await expect(page.getByText(content)).toBeVisible();
}

test.describe('Notes Interface', () => {
  test.beforeEach(async ({ page }) => {
    await createSessionWithTimer(page, TEST_TASK);
  });

  test('should open notes dialog from timer controls', async ({ page }) => {
    await openNotesDialog(page);
    
    // Verify notes dialog is open
    await expect(page.getByText('Notes')).toBeVisible();
    await expect(page.getByText(/active timer/i)).toBeVisible();
    await expect(page.getByText(TEST_TASK)).toBeVisible();
  });

  test('should display notes interface elements', async ({ page }) => {
    await openNotesDialog(page);
    
    // Check for main interface elements
    await expect(page.getByPlaceholder(/search.*notes/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /add note/i })).toBeVisible();
    await expect(page.locator('[data-testid="notes-list"]')).toBeVisible();
    
    // Check for filter options
    await expect(page.getByText(/task filter/i)).toBeVisible();
    await expect(page.getByText(/template filter/i)).toBeVisible();
  });

  test('should show active timer context', async ({ page }) => {
    await openNotesDialog(page);
    
    // Verify active timer context is displayed
    await expect(page.getByText(/active timer.*test task/i)).toBeVisible();
    
    // Check for timer-specific note options
    await expect(page.getByRole('button', { name: /add note/i })).toBeVisible();
  });
});

test.describe('Note Creation', () => {
  test.beforeEach(async ({ page }) => {
    await createSessionWithTimer(page, TEST_TASK);
    await openNotesDialog(page);
  });

  test('should create a free-form note', async ({ page }) => {
    await createNote(page, TEST_NOTE_CONTENT);
    
    // Verify note was created
    await expect(page.getByText(TEST_NOTE_CONTENT)).toBeVisible();
    
    // Check note metadata
    await expect(page.getByText(/just now|few seconds ago/i)).toBeVisible();
    await expect(page.getByText(TEST_TASK)).toBeVisible();
  });

  test('should create a template-based note', async ({ page }) => {
    await createNote(page, TEST_TEMPLATE_NOTE, true);
    
    // Verify template note was created
    await expect(page.getByText(TEST_TEMPLATE_NOTE)).toBeVisible();
    
    // Check for template indicator
    await expect(page.locator('[data-testid="template-indicator"]')).toBeVisible();
  });

  test('should validate note content', async ({ page }) => {
    // Try to save empty note
    const addNoteButton = page.getByRole('button', { name: /add note/i });
    await addNoteButton.click();
    
    const saveButton = page.getByRole('button', { name: /save.*note/i });
    await saveButton.click();
    
    // Should show validation error
    await expect(page.getByText(/note content.*required/i)).toBeVisible();
  });

  test('should cancel note creation', async ({ page }) => {
    const addNoteButton = page.getByRole('button', { name: /add note/i });
    await addNoteButton.click();
    
    // Fill some content
    const noteTextarea = page.getByPlaceholder(/enter.*note/i);
    await noteTextarea.fill('This note will be cancelled');
    
    // Cancel
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await cancelButton.click();
    
    // Verify note was not created
    await expect(page.getByText('This note will be cancelled')).not.toBeVisible();
  });
});

test.describe('Note Management', () => {
  test.beforeEach(async ({ page }) => {
    await createSessionWithTimer(page, TEST_TASK);
    await openNotesDialog(page);
    
    // Create a test note
    await createNote(page, TEST_NOTE_CONTENT);
  });

  test('should edit existing note', async ({ page }) => {
    // Click on note to edit
    const noteCard = page.getByText(TEST_NOTE_CONTENT).locator('..');
    await noteCard.getByRole('button', { name: /edit/i }).click();
    
    // Modify content
    const noteTextarea = page.getByPlaceholder(/enter.*note/i);
    await noteTextarea.clear();
    await noteTextarea.fill('Updated note content');
    
    // Save changes
    const saveButton = page.getByRole('button', { name: /save.*note/i });
    await saveButton.click();
    
    // Verify note was updated
    await expect(page.getByText('Updated note content')).toBeVisible();
    await expect(page.getByText(TEST_NOTE_CONTENT)).not.toBeVisible();
  });

  test('should delete note', async ({ page }) => {
    // Delete the note
    const noteCard = page.getByText(TEST_NOTE_CONTENT).locator('..');
    await noteCard.getByRole('button', { name: /delete/i }).click();
    
    // Confirm deletion
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Verify note was deleted
    await expect(page.getByText(TEST_NOTE_CONTENT)).not.toBeVisible();
  });

  test('should search notes', async ({ page }) => {
    // Create additional notes
    await createNote(page, 'Another test note for searching');
    await createNote(page, 'Different content entirely');
    
    // Search for specific content
    const searchInput = page.getByPlaceholder(/search.*notes/i);
    await searchInput.fill('test note');
    
    // Verify search results
    await expect(page.getByText(TEST_NOTE_CONTENT)).toBeVisible();
    await expect(page.getByText('Another test note')).toBeVisible();
    await expect(page.getByText('Different content')).not.toBeVisible();
  });

  test('should filter notes by task', async ({ page }) => {
    // Create note for different task
    await page.getByRole('button', { name: /close/i }).click(); // Close notes dialog
    
    // Create session for different task
    await createSessionWithTimer(page, 'Different Task');
    await openNotesDialog(page);
    await createNote(page, 'Note for different task');
    
    // Filter by task
    const taskFilter = page.locator('[data-testid="task-filter"]');
    await taskFilter.click();
    await page.getByText(TEST_TASK).click();
    
    // Verify filtering
    await expect(page.getByText(TEST_NOTE_CONTENT)).toBeVisible();
    await expect(page.getByText('Note for different task')).not.toBeVisible();
  });
});

test.describe('Task Notes', () => {
  test.beforeEach(async ({ page }) => {
    await createSessionWithTimer(page, TEST_TASK);
  });

  test('should access task notes', async ({ page }) => {
    // Click Task Note button
    const taskNoteButton = page.getByRole('button', { name: /task note/i });
    await taskNoteButton.click();
    
    // Should show template requirement or open task notes
    const alertText = await page.locator('[role="alert"]').textContent();
    if (alertText?.includes('template')) {
      // Template not set - expected behavior
      await expect(page.getByText(/template.*not set/i)).toBeVisible();
    } else {
      // Task notes opened
      await expect(page.getByText(/task.*notes/i)).toBeVisible();
    }
  });

  test('should handle missing task note template', async ({ page }) => {
    const taskNoteButton = page.getByRole('button', { name: /task note/i });
    await taskNoteButton.click();
    
    // Should show template configuration message
    await expect(page.getByText(/template.*not set/i)).toBeVisible();
  });
});

test.describe('Notes Persistence', () => {
  test('should persist notes across page refreshes', async ({ page }) => {
    await createSessionWithTimer(page, TEST_TASK);
    await openNotesDialog(page);
    await createNote(page, TEST_NOTE_CONTENT);
    
    // Close notes dialog
    await page.getByRole('button', { name: /close/i }).click();
    
    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Reopen notes
    await openNotesDialog(page);
    
    // Verify note persisted
    await expect(page.getByText(TEST_NOTE_CONTENT)).toBeVisible();
  });

  test('should persist notes across navigation', async ({ page }) => {
    await createSessionWithTimer(page, TEST_TASK);
    await openNotesDialog(page);
    await createNote(page, TEST_NOTE_CONTENT);
    
    // Close notes and navigate away
    await page.getByRole('button', { name: /close/i }).click();
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');
    
    // Navigate back to sessions
    await page.getByText('Sessions').click();
    await page.waitForLoadState('networkidle');
    
    // Reopen notes
    await openNotesDialog(page);
    
    // Verify note persisted
    await expect(page.getByText(TEST_NOTE_CONTENT)).toBeVisible();
  });
});

test.describe('Notes Integration', () => {
  test('should associate notes with correct timer instance', async ({ page }) => {
    await createSessionWithTimer(page, TEST_TASK);
    
    // Add multiple timer instances
    await page.getByRole('button', { name: /add timer/i }).click();
    
    // Open notes for first timer
    const timerInstances = page.locator('[data-testid="timer-instance"]');
    await timerInstances.first().getByRole('button', { name: /notes/i }).click();
    
    await createNote(page, 'Note for first timer');
    
    // Verify note is associated with correct timer
    await expect(page.getByText('Timer 1')).toBeVisible();
    await expect(page.getByText('Note for first timer')).toBeVisible();
  });

  test('should show notes count in timer interface', async ({ page }) => {
    await createSessionWithTimer(page, TEST_TASK);
    await openNotesDialog(page);
    await createNote(page, TEST_NOTE_CONTENT);
    
    // Close notes dialog
    await page.getByRole('button', { name: /close/i }).click();
    
    // Check for notes indicator
    await expect(page.locator('[data-testid="notes-count"]')).toBeVisible();
    await expect(page.getByText('1 note')).toBeVisible();
  });
});
