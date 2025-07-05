import { z } from 'zod';

/**
 * Subscription Types
 * 
 * Defines subscription tiers, features, and access control types
 */

// Subscription SKUs
export const SUBSCRIPTION_SKUS = {
  FREE: 'free',
  PRO: 'pro-lifetime',
  POWER: 'power-lifetime',
} as const;

export type SubscriptionSku = typeof SUBSCRIPTION_SKUS[keyof typeof SUBSCRIPTION_SKUS];

// Feature identifiers
export const FEATURES = {
  BASIC_TIME_TRACKING: 'basic_time_tracking',
  TASK_LIMIT_10: 'task_limit_10',
  UNLIMITED_TASKS: 'unlimited_tasks',
  DAILY_GOAL_TRACKING: 'daily_goal_tracking',
  LOCAL_DATA_STORAGE: 'local_data_storage',
  BASIC_REPORTS: 'basic_reports',
  NOTE_TEMPLATES: 'note_templates',
  ADVANCED_REPORTS: 'advanced_reports',
  CSV_JSON_EXPORT: 'csv_json_export',
  GOOGLE_DRIVE_SYNC: 'google_drive_sync',
  COMMAND_NOTES: 'command_notes',
  ADVANCED_ANALYTICS: 'advanced_analytics',
} as const;

export type Feature = typeof FEATURES[keyof typeof FEATURES];

// Subscription tier configuration
export interface SubscriptionTier {
  sku: SubscriptionSku;
  name: string;
  description: string;
  features: Feature[];
  taskLimit?: number;
}

// User subscription state
export interface UserSubscription {
  sku: SubscriptionSku;
  activatedAt: string;
  expiresAt?: string; // For future use if we add time-limited subscriptions
}

// Subscription tiers configuration
export const SUBSCRIPTION_TIERS: Record<SubscriptionSku, SubscriptionTier> = {
  [SUBSCRIPTION_SKUS.FREE]: {
    sku: SUBSCRIPTION_SKUS.FREE,
    name: 'Free',
    description: 'Basic time tracking features',
    taskLimit: 10,
    features: [
      FEATURES.BASIC_TIME_TRACKING,
      FEATURES.TASK_LIMIT_10,
      FEATURES.DAILY_GOAL_TRACKING,
      FEATURES.LOCAL_DATA_STORAGE,
      FEATURES.BASIC_REPORTS,
    ],
  },
  [SUBSCRIPTION_SKUS.PRO]: {
    sku: SUBSCRIPTION_SKUS.PRO,
    name: 'Pro',
    description: 'Everything in Free plus unlimited tasks and advanced features',
    features: [
      FEATURES.BASIC_TIME_TRACKING,
      FEATURES.UNLIMITED_TASKS,
      FEATURES.DAILY_GOAL_TRACKING,
      FEATURES.LOCAL_DATA_STORAGE,
      FEATURES.BASIC_REPORTS,
      FEATURES.NOTE_TEMPLATES,
      FEATURES.ADVANCED_REPORTS,
      FEATURES.CSV_JSON_EXPORT,
    ],
  },
  [SUBSCRIPTION_SKUS.POWER]: {
    sku: SUBSCRIPTION_SKUS.POWER,
    name: 'Power',
    description: 'Everything in Pro plus cloud sync and advanced analytics',
    features: [
      FEATURES.BASIC_TIME_TRACKING,
      FEATURES.UNLIMITED_TASKS,
      FEATURES.DAILY_GOAL_TRACKING,
      FEATURES.LOCAL_DATA_STORAGE,
      FEATURES.BASIC_REPORTS,
      FEATURES.NOTE_TEMPLATES,
      FEATURES.ADVANCED_REPORTS,
      FEATURES.CSV_JSON_EXPORT,
      FEATURES.GOOGLE_DRIVE_SYNC,
      FEATURES.COMMAND_NOTES,
      FEATURES.ADVANCED_ANALYTICS,
    ],
  },
};

// Zod schemas for validation
export const SubscriptionSkuSchema = z.enum([
  SUBSCRIPTION_SKUS.FREE,
  SUBSCRIPTION_SKUS.PRO,
  SUBSCRIPTION_SKUS.POWER,
]);

export const UserSubscriptionSchema = z.object({
  sku: SubscriptionSkuSchema,
  activatedAt: z.string(),
  expiresAt: z.string().optional(),
});

// Feature access helper types
export interface FeatureAccess {
  hasAccess: boolean;
  reason?: string;
  upgradeRequired?: SubscriptionSku;
}

// Task limit check result
export interface TaskLimitCheck {
  canAddTask: boolean;
  currentCount: number;
  limit?: number;
  reason?: string;
}
