/**
 * Migration Service
 * 
 * Handles data migration from the old timer system to the new session-based system.
 * Ensures backward compatibility and data integrity during the transition.
 */

import { TimeEntry } from '../types/timer';
import { TaskSession, TimerInstance } from '../types/timer';
import { Task } from '../types/task';
import { TaskNote } from '../types/notes';
import { StorageService } from './StorageService';

import { formatDateString } from '../utils/dateHelpers';

export interface MigrationResult {
  success: boolean;
  migratedSessions: number;
  migratedInstances: number;
  migratedNotes: number;
  errors: string[];
  warnings: string[];
}

export interface MigrationOptions {
  preserveOriginalData: boolean;
  createBackup: boolean;
  groupByDate: boolean;
  minimumDurationMs: number; // Minimum duration to create a timer instance
}

export class MigrationService {
  private storageService: StorageService;

  constructor() {
    this.storageService = StorageService.getInstance();
  }

  /**
   * Check if migration is needed
   */
  async needsMigration(): Promise<boolean> {
    try {
      // Check if we have old time entries but no sessions
      const timeEntries = await this.storageService.getTimeEntries();
      const sessions = await this.storageService.getTaskSessions();
      
      return timeEntries.length > 0 && sessions.length === 0;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Migrate existing time entries to session-based system
   */
  async migrateToSessions(options: MigrationOptions = {
    preserveOriginalData: true,
    createBackup: true,
    groupByDate: true,
    minimumDurationMs: 60000, // 1 minute minimum
  }): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedSessions: 0,
      migratedInstances: 0,
      migratedNotes: 0,
      errors: [],
      warnings: [],
    };

    try {
      // Create backup if requested
      if (options.createBackup) {
        await this.createMigrationBackup();
      }

      // Load existing data
      const timeEntries = await this.storageService.getTimeEntries();
      const tasks = await this.storageService.getTasks();
      const notes = await this.storageService.getTaskNotes();

      if (timeEntries.length === 0) {
        result.warnings.push('No time entries found to migrate');
        result.success = true;
        return result;
      }

      // Group time entries by task and date
      const groupedEntries = this.groupTimeEntries(timeEntries, options.groupByDate);
      
      // Create sessions and timer instances
      const sessions: TaskSession[] = [];
      const instances: TimerInstance[] = [];
      const migratedNotes: TaskNote[] = [];

      for (const [groupKey, entries] of Object.entries(groupedEntries)) {
        try {
          const { session, timerInstances, sessionNotes } = await this.createSessionFromEntries(
            entries,
            tasks,
            notes,
            options
          );

          sessions.push(session);
          instances.push(...timerInstances);
          migratedNotes.push(...sessionNotes);

          result.migratedSessions++;
          result.migratedInstances += timerInstances.length;
          result.migratedNotes += sessionNotes.length;

        } catch (error) {
          const errorMsg = `Failed to migrate group ${groupKey}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          console.error(errorMsg, error);
        }
      }

      // Save migrated data
      await this.storageService.setTaskSessions(sessions);
      
      // Update notes with session/instance associations
      if (migratedNotes.length > 0) {
        const existingNotes = await this.storageService.getTaskNotes();
        const updatedNotes = [...existingNotes, ...migratedNotes];
        await this.storageService.setTaskNotes(updatedNotes);
      }

      // Mark migration as complete
      await this.markMigrationComplete();

      result.success = result.errors.length === 0;
      
      if (result.success) {
        result.warnings.push(`Successfully migrated ${result.migratedSessions} sessions with ${result.migratedInstances} timer instances`);
      }

    } catch (error) {
      const errorMsg = `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      console.error('Migration error:', error);
    }

    return result;
  }

  /**
   * Group time entries by task and optionally by date
   */
  private groupTimeEntries(timeEntries: TimeEntry[], groupByDate: boolean): Record<string, TimeEntry[]> {
    const grouped: Record<string, TimeEntry[]> = {};

    for (const entry of timeEntries) {
      const taskKey = entry.taskName || 'Unknown Task';
      const dateKey = groupByDate ? formatDateString(new Date(entry.date)) : '';
      const groupKey = groupByDate ? `${taskKey}_${dateKey}` : taskKey;

      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(entry);
    }

    return grouped;
  }

  /**
   * Create a session from a group of time entries
   */
  private async createSessionFromEntries(
    entries: TimeEntry[],
    tasks: Task[],
    notes: TaskNote[],
    options: MigrationOptions
  ): Promise<{
    session: TaskSession;
    timerInstances: TimerInstance[];
    sessionNotes: TaskNote[];
  }> {
    // Sort entries by date
    const sortedEntries = entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstEntry = sortedEntries[0];
    const lastEntry = sortedEntries[sortedEntries.length - 1];

    // Find matching task
    const matchingTask = tasks.find(t => t.name === firstEntry.taskName);
    const taskId = matchingTask?.id || `migrated_task_${Date.now()}`;

    // Create session
    const sessionId = `migrated_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionDate = formatDateString(new Date(firstEntry.date));

    // Create timer instances from entries
    const timerInstances: TimerInstance[] = [];
    let totalDuration = 0;

    for (const entry of sortedEntries) {
      if (entry.duration && entry.duration >= options.minimumDurationMs) {
        const instanceId = `migrated_instance_${entry.id}`;
        const startTime = new Date(entry.date);
        const endTime = new Date(startTime.getTime() + entry.duration);

        const instance: TimerInstance = {
          id: instanceId,
          sessionId,
          startTime,
          endTime,
          duration: entry.duration,
          isRunning: false,
          isPaused: false,
          notes: undefined, // TimeEntry doesn't have description property
          createdAt: startTime.toISOString(),
          updatedAt: startTime.toISOString(),
        };

        timerInstances.push(instance);
        totalDuration += entry.duration;
      }
    }

    const session: TaskSession = {
      id: sessionId,
      taskId,
      taskName: firstEntry.taskName || 'Unknown Task',
      timerInstances,
      totalDuration,
      notes: this.createSessionNotes(),
      isActive: false,
      date: sessionDate,
      createdAt: new Date(firstEntry.date).toISOString(),
      updatedAt: new Date(lastEntry.date).toISOString(),
    };

    // Migrate associated notes
    const sessionNotes = this.migrateNotesToSession(notes, entries, sessionId, timerInstances);

    return {
      session,
      timerInstances,
      sessionNotes,
    };
  }

  /**
   * Create session notes from time entries
   */
  private createSessionNotes(): string | undefined {
    // TimeEntry doesn't have description property, so return undefined
    return undefined;
  }

  /**
   * Migrate notes to associate with sessions and timer instances
   */
  private migrateNotesToSession(
    notes: TaskNote[],
    entries: TimeEntry[],
    sessionId: string,
    timerInstances: TimerInstance[]
  ): TaskNote[] {
    const migratedNotes: TaskNote[] = [];
    const entryIds = new Set(entries.map(e => e.id));

    for (const note of notes) {
      if (note.timeEntryId && entryIds.has(note.timeEntryId)) {
        // Find corresponding timer instance
        const timerInstance = timerInstances.find(i => 
          i.id === `migrated_instance_${note.timeEntryId}`
        );

        const migratedNote: TaskNote = {
          ...note,
          id: `migrated_note_${note.id}`,
          sessionId,
          timerInstanceId: timerInstance?.id || null,
          noteLevel: timerInstance ? 'timer' : 'session',
        };

        migratedNotes.push(migratedNote);
      }
    }

    return migratedNotes;
  }

  /**
   * Create a backup before migration
   */
  private async createMigrationBackup(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `migration_backup_${timestamp}`;
    
    try {
      await this.storageService.createBackup(backupKey);
    } catch (error) {
      console.error('Failed to create migration backup:', error);
      throw new Error('Failed to create backup before migration');
    }
  }

  /**
   * Mark migration as complete
   */
  private async markMigrationComplete(): Promise<void> {
    const migrationInfo = {
      completed: true,
      completedAt: new Date().toISOString(),
      version: '1.0.0',
    };

    // Store migration info (you might want to add this to your storage keys)
    localStorage.setItem('session_migration_info', JSON.stringify(migrationInfo));
  }

  /**
   * Check if migration has been completed
   */
  async isMigrationComplete(): Promise<boolean> {
    try {
      const migrationInfo = localStorage.getItem('session_migration_info');
      if (migrationInfo) {
        const info = JSON.parse(migrationInfo);
        return info.completed === true;
      }
      return false;
    } catch (error) {
      console.error('Error checking migration completion:', error);
      return false;
    }
  }

  /**
   * Reset migration status (for testing purposes)
   */
  async resetMigrationStatus(): Promise<void> {
    localStorage.removeItem('session_migration_info');
  }
}
