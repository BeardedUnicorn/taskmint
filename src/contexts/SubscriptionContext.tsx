/**
 * Subscription Context
 * 
 * Provides subscription state and feature access control throughout the application
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  SubscriptionSku,
  UserSubscription,
  Feature,
  FeatureAccess,
  TaskLimitCheck,
  SUBSCRIPTION_SKUS,
  SUBSCRIPTION_TIERS,
} from '../types/subscription';
import { Task } from '../types/task';
import { SubscriptionService } from '../services/SubscriptionService';

interface SubscriptionContextType {
  // Current subscription state
  subscription: UserSubscription | null;
  currentTier: typeof SUBSCRIPTION_TIERS[SubscriptionSku] | null;
  isLoading: boolean;
  
  // Feature access methods
  hasFeatureAccess: (feature: Feature) => Promise<FeatureAccess>;
  checkTaskLimit: (currentTasks: Task[]) => Promise<TaskLimitCheck>;
  hasUnlimitedTasks: () => Promise<boolean>;
  
  // Subscription management
  upgradeSubscription: (newSku: SubscriptionSku) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  
  // Utility methods
  getAvailableUpgrades: () => Promise<SubscriptionSku[]>;
  getFeatureAccessSummary: () => Promise<Record<Feature, boolean>>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [currentTier, setCurrentTier] = useState<typeof SUBSCRIPTION_TIERS[SubscriptionSku] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const subscriptionService = SubscriptionService.getInstance();

  // Load subscription on mount
  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      setIsLoading(true);
      const userSubscription = await subscriptionService.getUserSubscription();
      const tier = await subscriptionService.getCurrentTier();
      
      setSubscription(userSubscription);
      setCurrentTier(tier);
    } catch (error) {
      // Only log errors in non-test environments
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to load subscription:', error);
      }
      // Set default free subscription on error
      const defaultSubscription: UserSubscription = {
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: new Date().toISOString(),
      };
      setSubscription(defaultSubscription);
      setCurrentTier(SUBSCRIPTION_TIERS[SUBSCRIPTION_SKUS.FREE]);
    } finally {
      setIsLoading(false);
    }
  };

  const hasFeatureAccess = async (feature: Feature): Promise<FeatureAccess> => {
    return await subscriptionService.hasFeatureAccess(feature);
  };

  const checkTaskLimit = async (currentTasks: Task[]): Promise<TaskLimitCheck> => {
    return await subscriptionService.checkTaskLimit(currentTasks);
  };

  const hasUnlimitedTasks = async (): Promise<boolean> => {
    return await subscriptionService.hasUnlimitedTasks();
  };

  const upgradeSubscription = async (newSku: SubscriptionSku): Promise<void> => {
    try {
      await subscriptionService.upgradeSubscription(newSku);
      await loadSubscription(); // Refresh the subscription state
    } catch (error) {
      console.error('Failed to upgrade subscription:', error);
      throw error;
    }
  };

  const refreshSubscription = async (): Promise<void> => {
    await loadSubscription();
  };

  const getAvailableUpgrades = async (): Promise<SubscriptionSku[]> => {
    return await subscriptionService.getAvailableUpgrades();
  };

  const getFeatureAccessSummary = async (): Promise<Record<Feature, boolean>> => {
    return await subscriptionService.getFeatureAccessSummary();
  };

  const contextValue: SubscriptionContextType = {
    subscription,
    currentTier,
    isLoading,
    hasFeatureAccess,
    checkTaskLimit,
    hasUnlimitedTasks,
    upgradeSubscription,
    refreshSubscription,
    getAvailableUpgrades,
    getFeatureAccessSummary,
  };

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextType {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

// Convenience hooks for common subscription checks
export function useFeatureAccess(feature: Feature) {
  const { hasFeatureAccess } = useSubscription();
  const [access, setAccess] = useState<FeatureAccess>({ hasAccess: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        setIsLoading(true);
        const result = await hasFeatureAccess(feature);
        setAccess(result);
      } catch (error) {
        // Only log errors in non-test environments
        if (process.env.NODE_ENV !== 'test') {
          console.error(`Failed to check feature access for ${feature}:`, error);
        }
        setAccess({ hasAccess: false, reason: 'Failed to check feature access' });
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();
  }, [feature, hasFeatureAccess]);

  return { ...access, isLoading };
}

export function useTaskLimit(currentTasks: Task[]) {
  const { checkTaskLimit } = useSubscription();
  const [limitCheck, setLimitCheck] = useState<TaskLimitCheck>({ 
    canAddTask: false, 
    currentCount: 0 
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkLimit = async () => {
      try {
        setIsLoading(true);
        const result = await checkTaskLimit(currentTasks);
        setLimitCheck(result);
      } catch (error) {
        // Only log errors in non-test environments
        if (process.env.NODE_ENV !== 'test') {
          console.error('Failed to check task limit:', error);
        }
        setLimitCheck({ 
          canAddTask: false, 
          currentCount: currentTasks.length,
          reason: 'Failed to check task limit'
        });
      } finally {
        setIsLoading(false);
      }
    };

    checkLimit();
  }, [currentTasks, checkTaskLimit]);

  return { ...limitCheck, isLoading };
}
