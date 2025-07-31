/**
 * Subscription Service
 * 
 * Manages subscription tiers, feature access control, and user subscription state
 */

import {
  SubscriptionSku,
  UserSubscription,
  Feature,
  FeatureAccess,
  TaskLimitCheck,
  SUBSCRIPTION_SKUS,
  SUBSCRIPTION_TIERS,
  UserSubscriptionSchema,
} from '../types/subscription';
import { Task } from '../types/task';
import { StorageService } from './StorageService';
import { STORAGE_KEYS } from '../constants';

export interface ISubscriptionService {
  // Subscription management
  getUserSubscription(): Promise<UserSubscription>;
  setUserSubscription(subscription: UserSubscription): Promise<void>;
  upgradeSubscription(newSku: SubscriptionSku): Promise<void>;
  
  // Feature access control
  hasFeatureAccess(feature: Feature): Promise<FeatureAccess>;
  checkTaskLimit(currentTasks: Task[]): Promise<TaskLimitCheck>;
  
  // Utility methods
  getCurrentTier(): Promise<typeof SUBSCRIPTION_TIERS[SubscriptionSku]>;
  getAvailableUpgrades(): Promise<SubscriptionSku[]>;
}

export class SubscriptionService implements ISubscriptionService {
  private static instance: SubscriptionService;
  private storageService: StorageService;

  constructor(storageService?: StorageService) {
    this.storageService = storageService || StorageService.getInstance();
  }

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  /**
   * Get the current user subscription
   */
  async getUserSubscription(): Promise<UserSubscription> {
    const defaultSubscription: UserSubscription = {
      sku: SUBSCRIPTION_SKUS.FREE,
      activatedAt: new Date().toISOString(),
    };

    return await this.storageService.getItem(
      STORAGE_KEYS.USER_SUBSCRIPTION,
      defaultSubscription,
      UserSubscriptionSchema
    );
  }

  /**
   * Set the user subscription
   */
  async setUserSubscription(subscription: UserSubscription): Promise<void> {
    await this.storageService.setItem(
      STORAGE_KEYS.USER_SUBSCRIPTION,
      subscription,
      UserSubscriptionSchema
    );
  }

  /**
   * Upgrade user subscription to a new SKU
   */
  async upgradeSubscription(newSku: SubscriptionSku): Promise<void> {
    const currentSubscription = await this.getUserSubscription();
    
    const upgradedSubscription: UserSubscription = {
      ...currentSubscription,
      sku: newSku,
      activatedAt: new Date().toISOString(),
    };

    await this.setUserSubscription(upgradedSubscription);
  }

  /**
   * Check if user has access to a specific feature
   */
  async hasFeatureAccess(feature: Feature): Promise<FeatureAccess> {
    const subscription = await this.getUserSubscription();
    const tier = SUBSCRIPTION_TIERS[subscription.sku];

    const hasAccess = tier.features.includes(feature);

    if (hasAccess) {
      return { hasAccess: true };
    }

    // Find the lowest tier that includes this feature
    const upgradeRequired = this.findLowestTierWithFeature(feature);

    return {
      hasAccess: false,
      reason: `This feature requires ${upgradeRequired ? SUBSCRIPTION_TIERS[upgradeRequired].name : 'a higher'} subscription`,
      upgradeRequired,
    };
  }

  /**
   * Check if user can add more tasks based on their subscription limit
   */
  async checkTaskLimit(currentTasks: Task[]): Promise<TaskLimitCheck> {
    const subscription = await this.getUserSubscription();
    const tier = SUBSCRIPTION_TIERS[subscription.sku];

    const currentCount = currentTasks.length;

    // If no task limit is set, unlimited tasks are allowed
    if (!tier.taskLimit) {
      return {
        canAddTask: true,
        currentCount,
      };
    }

    const canAddTask = currentCount < tier.taskLimit;

    return {
      canAddTask,
      currentCount,
      limit: tier.taskLimit,
      reason: canAddTask 
        ? undefined 
        : `Task limit reached (${currentCount}/${tier.taskLimit}). Upgrade to Pro for unlimited tasks.`,
    };
  }

  /**
   * Get the current subscription tier configuration
   */
  async getCurrentTier(): Promise<typeof SUBSCRIPTION_TIERS[SubscriptionSku]> {
    const subscription = await this.getUserSubscription();
    return SUBSCRIPTION_TIERS[subscription.sku];
  }

  /**
   * Get available upgrade options for the current user
   */
  async getAvailableUpgrades(): Promise<SubscriptionSku[]> {
    const subscription = await this.getUserSubscription();
    const currentSku = subscription.sku;

    const tierOrder: SubscriptionSku[] = [
      SUBSCRIPTION_SKUS.FREE,
      SUBSCRIPTION_SKUS.PRO,
      SUBSCRIPTION_SKUS.POWER,
    ];

    const currentIndex = tierOrder.indexOf(currentSku);
    return tierOrder.slice(currentIndex + 1);
  }

  /**
   * Find the lowest subscription tier that includes a specific feature
   */
  private findLowestTierWithFeature(feature: Feature): SubscriptionSku | undefined {
    const tierOrder: SubscriptionSku[] = [
      SUBSCRIPTION_SKUS.FREE,
      SUBSCRIPTION_SKUS.PRO,
      SUBSCRIPTION_SKUS.POWER,
    ];

    for (const sku of tierOrder) {
      const tier = SUBSCRIPTION_TIERS[sku];
      if (tier.features.includes(feature)) {
        return sku;
      }
    }

    return undefined;
  }

  /**
   * Check if current subscription allows unlimited tasks
   */
  async hasUnlimitedTasks(): Promise<boolean> {
    const featureAccess = await this.hasFeatureAccess('unlimited_tasks');
    return featureAccess.hasAccess;
  }

  /**
   * Get feature access summary for current subscription, including overrides
   */
  async getFeatureAccessSummary(): Promise<Record<Feature, boolean>> {
    const subscription = await this.getUserSubscription();
    const tier = SUBSCRIPTION_TIERS[subscription.sku];
    const featureOverrides = await this.getFeatureOverrides();

    const summary: Record<string, boolean> = {};
    
    // Check all possible features
    const allFeatures = Object.values({
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
    }) as Feature[];

    for (const feature of allFeatures) {
      // Check if there's an override, otherwise use the tier's feature list
      if (featureOverrides.hasOwnProperty(feature)) {
        summary[feature] = featureOverrides[feature];
      } else {
        summary[feature] = tier.features.includes(feature);
      }
    }

    return summary as Record<Feature, boolean>;
  }

  /**
   * Get feature overrides from storage
   */
  async getFeatureOverrides(): Promise<Record<Feature, boolean>> {
    return await this.storageService.getItem(
      STORAGE_KEYS.FEATURE_OVERRIDES,
      {} as Record<Feature, boolean>
    );
  }

  /**
   * Set a feature override
   */
  async setFeatureOverride(feature: Feature, enabled: boolean): Promise<void> {
    const overrides = await this.getFeatureOverrides();
    overrides[feature] = enabled;
    await this.storageService.setItem(STORAGE_KEYS.FEATURE_OVERRIDES, overrides);
  }

  /**
   * Clear a feature override
   */
  async clearFeatureOverride(feature: Feature): Promise<void> {
    const overrides = await this.getFeatureOverrides();
    delete overrides[feature];
    await this.storageService.setItem(STORAGE_KEYS.FEATURE_OVERRIDES, overrides);
  }

  /**
   * Get task limit override
   */
  async getTaskLimitOverride(): Promise<number | null> {
    return await this.storageService.getItem(STORAGE_KEYS.TASK_LIMIT_OVERRIDE, null);
  }

  /**
   * Set task limit override
   */
  async setTaskLimitOverride(limit: number | null): Promise<void> {
    if (limit === null) {
      await this.storageService.removeItem(STORAGE_KEYS.TASK_LIMIT_OVERRIDE);
    } else {
      await this.storageService.setItem(STORAGE_KEYS.TASK_LIMIT_OVERRIDE, limit);
    }
  }

  /**
   * Get the effective task limit (considering overrides)
   */
  async getEffectiveTaskLimit(): Promise<number | undefined> {
    const override = await this.getTaskLimitOverride();
    if (override !== null) {
      return override;
    }

    const subscription = await this.getUserSubscription();
    const tier = SUBSCRIPTION_TIERS[subscription.sku];
    return tier.taskLimit;
  }
}
