/**
 * SubscriptionContext Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SubscriptionProvider, useSubscription, useFeatureAccess, useTaskLimit } from '../SubscriptionContext';
import { SubscriptionService } from '../../services/SubscriptionService';
import {
  SUBSCRIPTION_SKUS,
  SUBSCRIPTION_TIERS,
  FEATURES,
} from '../../types/subscription';

// Mock SubscriptionService
vi.mock('../../services/SubscriptionService');

// Test component that uses the subscription context
function TestComponent() {
  const { subscription, currentTier, isLoading } = useSubscription();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div>
      <div data-testid="subscription-sku">{subscription?.sku}</div>
      <div data-testid="tier-name">{currentTier?.name}</div>
    </div>
  );
}

// Test component for feature access hook
function FeatureTestComponent({ feature }: { feature: string }) {
  const { hasAccess, isLoading } = useFeatureAccess(feature as any);
  
  if (isLoading) return <div>Loading feature...</div>;
  
  return (
    <div data-testid="feature-access">{hasAccess ? 'allowed' : 'denied'}</div>
  );
}

// Test component for task limit hook
function TaskLimitTestComponent({ tasks }: { tasks: any[] }) {
  const { canAddTask, currentCount, limit, isLoading } = useTaskLimit(tasks);
  
  if (isLoading) return <div>Loading limit...</div>;
  
  return (
    <div>
      <div data-testid="can-add-task">{canAddTask ? 'yes' : 'no'}</div>
      <div data-testid="current-count">{currentCount}</div>
      <div data-testid="limit">{limit || 'unlimited'}</div>
    </div>
  );
}

describe('SubscriptionContext', () => {
  let mockSubscriptionService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock subscription service
    mockSubscriptionService = {
      getUserSubscription: vi.fn(),
      getCurrentTier: vi.fn(),
      hasFeatureAccess: vi.fn(),
      checkTaskLimit: vi.fn(),
      upgradeSubscription: vi.fn(),
      getAvailableUpgrades: vi.fn(),
      getFeatureAccessSummary: vi.fn(),
    };

    // Mock the getInstance method
    vi.mocked(SubscriptionService.getInstance).mockReturnValue(mockSubscriptionService);
  });

  describe('SubscriptionProvider', () => {
    it('should provide subscription context with loading state', async () => {
      mockSubscriptionService.getUserSubscription.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });
      
      mockSubscriptionService.getCurrentTier.mockResolvedValue(
        SUBSCRIPTION_TIERS[SUBSCRIPTION_SKUS.FREE]
      );

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      // Should show loading initially
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Wait for subscription to load
      await waitFor(() => {
        expect(screen.getByTestId('subscription-sku')).toHaveTextContent('free');
        expect(screen.getByTestId('tier-name')).toHaveTextContent('Free');
      });
    });

    it('should handle subscription loading errors gracefully', async () => {
      mockSubscriptionService.getUserSubscription.mockRejectedValue(new Error('Failed to load'));
      mockSubscriptionService.getCurrentTier.mockResolvedValue(
        SUBSCRIPTION_TIERS[SUBSCRIPTION_SKUS.FREE]
      );

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      // Should fall back to free subscription on error
      await waitFor(() => {
        expect(screen.getByTestId('subscription-sku')).toHaveTextContent('free');
        expect(screen.getByTestId('tier-name')).toHaveTextContent('Free');
      });
    });

    it('should provide upgrade functionality', async () => {
      mockSubscriptionService.getUserSubscription.mockResolvedValue({
        sku: SUBSCRIPTION_SKUS.FREE,
        activatedAt: '2023-01-01T00:00:00.000Z',
      });
      
      mockSubscriptionService.getCurrentTier.mockResolvedValue(
        SUBSCRIPTION_TIERS[SUBSCRIPTION_SKUS.FREE]
      );

      mockSubscriptionService.upgradeSubscription.mockResolvedValue(undefined);

      function UpgradeTestComponent() {
        const { upgradeSubscription } = useSubscription();
        
        return (
          <button onClick={() => upgradeSubscription(SUBSCRIPTION_SKUS.PRO)}>
            Upgrade
          </button>
        );
      }

      render(
        <SubscriptionProvider>
          <UpgradeTestComponent />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Upgrade')).toBeInTheDocument();
      });

      // Click upgrade button
      await act(async () => {
        screen.getByText('Upgrade').click();
      });

      expect(mockSubscriptionService.upgradeSubscription).toHaveBeenCalledWith(
        SUBSCRIPTION_SKUS.PRO
      );
    });
  });

  describe('useFeatureAccess hook', () => {
    it('should return feature access status', async () => {
      mockSubscriptionService.hasFeatureAccess.mockResolvedValue({
        hasAccess: true,
      });

      render(
        <SubscriptionProvider>
          <FeatureTestComponent feature={FEATURES.UNLIMITED_TASKS} />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('feature-access')).toHaveTextContent('allowed');
      });

      expect(mockSubscriptionService.hasFeatureAccess).toHaveBeenCalledWith(
        FEATURES.UNLIMITED_TASKS
      );
    });

    it('should handle feature access denial', async () => {
      mockSubscriptionService.hasFeatureAccess.mockResolvedValue({
        hasAccess: false,
        reason: 'Upgrade required',
      });

      render(
        <SubscriptionProvider>
          <FeatureTestComponent feature={FEATURES.UNLIMITED_TASKS} />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('feature-access')).toHaveTextContent('denied');
      });
    });

    it('should handle feature access check errors', async () => {
      mockSubscriptionService.hasFeatureAccess.mockRejectedValue(new Error('Check failed'));

      render(
        <SubscriptionProvider>
          <FeatureTestComponent feature={FEATURES.UNLIMITED_TASKS} />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('feature-access')).toHaveTextContent('denied');
      });
    });
  });

  describe('useTaskLimit hook', () => {
    it('should return task limit information for unlimited subscription', async () => {
      mockSubscriptionService.checkTaskLimit.mockResolvedValue({
        canAddTask: true,
        currentCount: 5,
      });

      const mockTasks = Array(5).fill(null).map((_, i) => ({ id: `task-${i}` }));

      render(
        <SubscriptionProvider>
          <TaskLimitTestComponent tasks={mockTasks} />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('can-add-task')).toHaveTextContent('yes');
        expect(screen.getByTestId('current-count')).toHaveTextContent('5');
        expect(screen.getByTestId('limit')).toHaveTextContent('unlimited');
      });
    });

    it('should return task limit information for limited subscription', async () => {
      mockSubscriptionService.checkTaskLimit.mockResolvedValue({
        canAddTask: false,
        currentCount: 10,
        limit: 10,
        reason: 'Task limit reached',
      });

      const mockTasks = Array(10).fill(null).map((_, i) => ({ id: `task-${i}` }));

      render(
        <SubscriptionProvider>
          <TaskLimitTestComponent tasks={mockTasks} />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('can-add-task')).toHaveTextContent('no');
        expect(screen.getByTestId('current-count')).toHaveTextContent('10');
        expect(screen.getByTestId('limit')).toHaveTextContent('10');
      });
    });

    it('should handle task limit check errors', async () => {
      mockSubscriptionService.checkTaskLimit.mockRejectedValue(new Error('Check failed'));

      const mockTasks = [{ id: 'task-1' }];

      render(
        <SubscriptionProvider>
          <TaskLimitTestComponent tasks={mockTasks} />
        </SubscriptionProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('can-add-task')).toHaveTextContent('no');
        expect(screen.getByTestId('current-count')).toHaveTextContent('1');
      });
    });
  });

  describe('context error handling', () => {
    it('should throw error when useSubscription is used outside provider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = vi.fn();

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useSubscription must be used within a SubscriptionProvider');

      console.error = originalError;
    });
  });
});
