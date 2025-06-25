/**
 * Daily Goals Related Types
 *
 * This file contains all types related to daily earnings goal functionality,
 * including goal definitions, achievements, and related operations.
 */

import { z } from 'zod';

export interface DailyGoal {
  targetAmount: number;
  currency: string; // e.g., "USD"
  isEnabled: boolean;
  lastNotifiedPercent: number; // Tracks 0, 50, 75, 100, or >100 to prevent re-notifications for the same tier on the same day
  lastNotificationDate: string; // YYYY-MM-DD, to reset lastNotifiedPercent daily
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export interface DailyGoalAchievement {
  id: string; // Unique ID for the achievement record
  date: string; // YYYY-MM-DD
  goalAmount: number;
  earnedAmount: number;
  currency: string;
  percentageAchieved: number; // e.g., 120 for 120%
  status: 'hit' | 'missed' | 'exceeded';
  difference: number; // Positive if exceeded/hit, negative if missed
  recordedAt: string; // ISO date
}

// Zod validation schemas
export const DailyGoalSchema = z.object({
  targetAmount: z.number().min(0, 'Target amount must be non-negative'),
  currency: z.string().min(1, 'Currency is required').max(10, 'Currency code too long'),
  isEnabled: z.boolean(),
  lastNotifiedPercent: z.number().min(0).max(200), // Allow up to 200% for exceeded goals
  lastNotificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DailyGoalAchievementSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  goalAmount: z.number().min(0),
  earnedAmount: z.number().min(0),
  currency: z.string().min(1).max(10),
  percentageAchieved: z.number().min(0),
  status: z.enum(['hit', 'missed', 'exceeded']),
  difference: z.number(),
  recordedAt: z.string().datetime(),
});

// Form data types for goal configuration
export interface DailyGoalFormData {
  targetAmount: number;
  currency: string;
  isEnabled: boolean;
}

// Progress tracking types
export interface DailyGoalProgress {
  currentEarnings: number;
  targetAmount: number;
  currency: string;
  percentageAchieved: number;
  status: 'on-track' | 'behind' | 'achieved' | 'exceeded';
  remainingAmount: number;
  isGoalEnabled: boolean;
}

// Notification types
export type GoalNotificationType = 'halfway' | 'three-quarters' | 'achieved' | 'exceeded';

export interface GoalNotificationData {
  type: GoalNotificationType;
  currentEarnings: number;
  targetAmount: number;
  percentageAchieved: number;
  currency: string;
}
