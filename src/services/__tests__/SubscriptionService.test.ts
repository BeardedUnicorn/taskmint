/**
 * SubscriptionService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionService } from '../SubscriptionService';
import { StorageService } from '../StorageService';
import {
  SUBSCRIPTION_SKUS,
  SUBSCRIPTION_TIERS,
  FEATURES,
} from '../../types/subscription';

// Mock StorageService
vi.mock('../StorageService');

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;
  let mockStorageService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock storage service
    mockStorageService = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    };

    // Create subscription service with mocked storage
    subscriptionService = new SubscriptionService(mockStorageService);
  });

  describe('getUserSubscription', () => {
    it('should return default free subscription when no subscription exists', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: expect.any(String),
      });

      const subscription = await subscriptionService.getUserSubscription();

      expect(subscription.sku).toBe(SUBSCRIPTION_SKUS.FREE);
      expect(subscription.activatedAt).toBeDefined();
    });

    it('should handle missing storage data by returning default subscription', async () => {
      mockStorageService.getItem.mockImplementation(async (_key, defaultValue) => defaultValue);

      const subscription = await subscriptionService.getUserSubscription();

      expect(subscription.sku).toBe(SUBSCRIPTION_SKUS.FREE);
      expect(subscription.activatedAt).toBeDefined();
    });

    it('should return existing subscription from storage', async () => {
      const existingSubscription = {
        sku: SUBSCRIPTION_SKUS.PRO,
        activatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockStorageService.getItem.mockResolvedValue(existingSubscription);

      const subscription = await subscriptionService.getUserSubscription();

      expect(subscription).toEqual(existingSubscription);
    });
  });

  describe('upgradeSubscription', () => {
    it('should upgrade subscription and save to storage', async () => {
      const currentSubscription = {
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockStorageService.getItem.mockResolvedValue(currentSubscription);
      mockStorageService.setItem.mockResolvedValue(undefined);

      await subscriptionService.upgradeSubscription(SUBSCRIPTION_SKUS.PRO);

      expect(mockStorageService.setItem).toHaveBeenCalledWith(
        'userSubscription',
        {
          sku: SUBSCRIPTION_SKUS.PRO,
          activatedAt: expect.any(String),
        },
        expect.any(Object)
      );
    });

    it('should throw an error when upgrading to an invalid SKU', async () => {
      const currentSubscription = {
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockStorageService.getItem.mockResolvedValue(currentSubscription);
      const invalidSkuError = new Error('Invalid SKU');
      mockStorageService.setItem.mockRejectedValue(invalidSkuError);

      await expect(
        subscriptionService.upgradeSubscription('INVALID' as any)
      ).rejects.toThrow('Invalid SKU');
    });
  });

  describe('hasFeatureAccess', () => {
    it('should return true for features included in current subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.PRO,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const access = await subscriptionService.hasFeatureAccess(FEATURES.UNLIMITED_TASKS);

      expect(access.hasAccess).toBe(true);
    });

    it('should return false for features not included in current subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const access = await subscriptionService.hasFeatureAccess(FEATURES.UNLIMITED_TASKS);

      expect(access.hasAccess).toBe(false);
      expect(access.reason).toContain('Pro subscription');
      expect(access.upgradeRequired).toBe(SUBSCRIPTION_SKUS.PRO);
    });
  });

  describe('checkTaskLimit', () => {
    it('should allow unlimited tasks for Pro subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.PRO,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const mockTasks = Array(20).fill(null).map((_, i) => ({ id: `task-${i}`, name: `Task ${i}` }));
      const limitCheck = await subscriptionService.checkTaskLimit(mockTasks as any);

      expect(limitCheck.canAddTask).toBe(true);
      expect(limitCheck.limit).toBeUndefined();
    });

    it('should enforce task limit for Free subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const mockTasks = Array(10).fill(null).map((_, i) => ({ id: `task-${i}`, name: `Task ${i}` }));
      const limitCheck = await subscriptionService.checkTaskLimit(mockTasks as any);

      expect(limitCheck.canAddTask).toBe(false);
      expect(limitCheck.limit).toBe(10);
      expect(limitCheck.currentCount).toBe(10);
      expect(limitCheck.reason).toContain('Task limit reached');
    });

    it('should allow adding tasks when under limit for Free subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const mockTasks = Array(5).fill(null).map((_, i) => ({ id: `task-${i}`, name: `Task ${i}` }));
      const limitCheck = await subscriptionService.checkTaskLimit(mockTasks as any);

      expect(limitCheck.canAddTask).toBe(true);
      expect(limitCheck.limit).toBe(10);
      expect(limitCheck.currentCount).toBe(5);
    });
  });

  describe('getCurrentTier', () => {
    it('should return correct tier configuration for current subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.PRO,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const tier = await subscriptionService.getCurrentTier();

      expect(tier).toEqual(SUBSCRIPTION_TIERS[SUBSCRIPTION_SKUS.PRO]);
      expect(tier.name).toBe('Pro');
      expect(tier.features).toContain(FEATURES.UNLIMITED_TASKS);
    });
  });

  describe('getAvailableUpgrades', () => {
    it('should return higher tier options for Free subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const upgrades = await subscriptionService.getAvailableUpgrades();

      expect(upgrades).toEqual([SUBSCRIPTION_SKUS.PRO, SUBSCRIPTION_SKUS.POWER]);
    });

    it('should return only Power tier for Pro subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.PRO,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const upgrades = await subscriptionService.getAvailableUpgrades();

      expect(upgrades).toEqual([SUBSCRIPTION_SKUS.POWER]);
    });

    it('should return empty array for Power subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.POWER,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const upgrades = await subscriptionService.getAvailableUpgrades();

      expect(upgrades).toEqual([]);
    });
  });

  describe('getFeatureAccessSummary', () => {
    it('should return correct feature access for Free subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const summary = await subscriptionService.getFeatureAccessSummary();

      expect(summary[FEATURES.BASIC_TIME_TRACKING]).toBe(true);
      expect(summary[FEATURES.TASK_LIMIT_10]).toBe(true);
      expect(summary[FEATURES.UNLIMITED_TASKS]).toBe(false);
      expect(summary[FEATURES.NOTE_TEMPLATES]).toBe(false);
      expect(summary[FEATURES.GOOGLE_DRIVE_SYNC]).toBe(false);
    });

    it('should return correct feature access for Pro subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.PRO,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const summary = await subscriptionService.getFeatureAccessSummary();

      expect(summary[FEATURES.BASIC_TIME_TRACKING]).toBe(true);
      expect(summary[FEATURES.UNLIMITED_TASKS]).toBe(true);
      expect(summary[FEATURES.NOTE_TEMPLATES]).toBe(true);
      expect(summary[FEATURES.CSV_JSON_EXPORT]).toBe(true);
      expect(summary[FEATURES.GOOGLE_DRIVE_SYNC]).toBe(false);
      expect(summary[FEATURES.COMMAND_NOTES]).toBe(false);
    });

    it('should return correct feature access for Power subscription', async () => {
      mockStorageService.getItem.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.POWER,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });

      const summary = await subscriptionService.getFeatureAccessSummary();

      expect(summary[FEATURES.BASIC_TIME_TRACKING]).toBe(true);
      expect(summary[FEATURES.UNLIMITED_TASKS]).toBe(true);
      expect(summary[FEATURES.NOTE_TEMPLATES]).toBe(true);
      expect(summary[FEATURES.CSV_JSON_EXPORT]).toBe(true);
      expect(summary[FEATURES.GOOGLE_DRIVE_SYNC]).toBe(true);
      expect(summary[FEATURES.COMMAND_NOTES]).toBe(true);
      expect(summary[FEATURES.ADVANCED_ANALYTICS]).toBe(true);
    });
  });
});
