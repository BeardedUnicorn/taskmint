/**
 * Tests for useDailyGoals hook
 */

import { renderHook, act } from '@testing-library/react';
import { useDailyGoals } from '../useDailyGoals';
import { DailyGoal, DailyGoalAchievement } from '../../types';
import { useLocalStorage } from '../useLocalStorage'; // Import the actual module

const mockSetCurrentGoal = vi.fn();
const mockSetAchievements = vi.fn();

vi.mock('../useLocalStorage', () => ({
  useLocalStorage: vi.fn((key) => {
    if (key === 'dailyGoal') {
      return [null, mockSetCurrentGoal];
    }
    if (key === 'dailyGoalAchievements') {
      return [[], mockSetAchievements];
    }
    return [null, vi.fn()];
  }),
}));

// Mock constants
vi.mock('../../constants', () => ({
  STORAGE_KEYS: {
    DAILY_GOAL: 'dailyGoal',
    DAILY_GOAL_ACHIEVEMENTS: 'dailyGoalAchievements',
  },
}));

describe('useDailyGoals', () => {
  const mockGoal: DailyGoal = {
    targetAmount: 100,
    currency: 'USD',
    isEnabled: true,
    lastNotifiedPercent: 0,
    lastNotificationDate: '2024-01-01',
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z',
  };

  const mockAchievement: DailyGoalAchievement = {
    id: 'achievement_1',
    date: '2024-01-01',
    goalAmount: 100,
    earnedAmount: 120,
    currency: 'USD',
    percentageAchieved: 120,
    status: 'exceeded',
    difference: 20,
    recordedAt: '2024-01-01T23:59:59.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2024-01-02T12:00:00.000Z')); // Control date for tests

    // Reset the mock implementation of useLocalStorage for each test
    vi.mocked(useLocalStorage).mockImplementation((key) => {
      if (key === 'dailyGoal') {
        return [null, mockSetCurrentGoal];
      }
      if (key === 'dailyGoalAchievements') {
        return [[], mockSetAchievements];
      }
      return [null, vi.fn()];
    });

    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with null goal and empty achievements', () => {
      const { result } = renderHook(() => useDailyGoals());

      expect(result.current.currentGoal).toBe(null);
      expect(result.current.achievements).toEqual([]);
    });

    it('should call useLocalStorage with correct parameters', () => {
      renderHook(() => useDailyGoals());

      expect(useLocalStorage).toHaveBeenCalledWith('dailyGoal', null);
      expect(useLocalStorage).toHaveBeenCalledWith('dailyGoalAchievements', []);
    });

    it('should initialize with existing goal and achievements', () => {
      vi.mocked(useLocalStorage)
        .mockReturnValueOnce([mockGoal, mockSetCurrentGoal])
        .mockReturnValueOnce([[mockAchievement], mockSetAchievements]);

      const { result } = renderHook(() => useDailyGoals());

      expect(result.current.currentGoal).toEqual(mockGoal);
      expect(result.current.achievements).toEqual([mockAchievement]);
    });
  });

  describe('getCurrentGoal', () => {
    it('should return null when no goal exists', () => {
      vi.mocked(useLocalStorage).mockReturnValue([null, vi.fn()]);
      const { result } = renderHook(() => useDailyGoals());
      expect(result.current.getCurrentGoal()).toBe(null);
    });

    it('should return current goal when it exists', () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [mockGoal, vi.fn()];
        return [[], vi.fn()];
      });      const { result } = renderHook(() => useDailyGoals());
      expect(result.current.getCurrentGoal()).toEqual(mockGoal);
    });
  });

  describe('updateDailyGoal', () => {
    it('should create new goal when none exists', async () => {
      const { result } = renderHook(() => useDailyGoals());
      
      useLocalStorage.mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [null, mockSetCurrentGoal];
        return [[], vi.fn()];
      });

      await act(async () => {
        await result.current.updateDailyGoal({
          targetAmount: 150,
          currency: 'EUR',
          isEnabled: true,
        });
      });

      expect(mockSetCurrentGoal).toHaveBeenCalledWith({
        targetAmount: 150,
        currency: 'EUR',
        isEnabled: true,
        lastNotifiedPercent: 0,
        lastNotificationDate: '',
        createdAt: '2024-01-02T12:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should update existing goal', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [mockGoal, mockSetCurrentGoal];
        return [[], vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      await act(async () => {
        await result.current.updateDailyGoal({
          targetAmount: 200,
          currency: 'EUR',
        });
      });

      expect(mockSetCurrentGoal).toHaveBeenCalledWith({
        ...mockGoal,
        targetAmount: 200,
        currency: 'EUR',
        updatedAt: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should preserve existing timestamps when updating', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [mockGoal, mockSetCurrentGoal];
        return [[], vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      await act(async () => {
        await result.current.updateDailyGoal({ targetAmount: 200 });
      });

      const updatedGoal = mockSetCurrentGoal.mock.calls[0][0];
      expect(updatedGoal.createdAt).toBe(mockGoal.createdAt);
      expect(updatedGoal.lastNotifiedPercent).toBe(mockGoal.lastNotifiedPercent);
      expect(updatedGoal.lastNotificationDate).toBe(mockGoal.lastNotificationDate);
    });
  });

  describe('enableDailyGoal', () => {
    it('should enable existing goal', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [{ ...mockGoal, isEnabled: false }, mockSetCurrentGoal];
        return [[], vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      await act(async () => {
        await result.current.enableDailyGoal(true);
      });

      expect(mockSetCurrentGoal).toHaveBeenCalledWith({
        ...mockGoal,
        isEnabled: true,
        updatedAt: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should disable existing goal', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [mockGoal, mockSetCurrentGoal];
        return [[], vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      await act(async () => {
        await result.current.enableDailyGoal(false);
      });

      expect(mockSetCurrentGoal).toHaveBeenCalledWith({
        ...mockGoal,
        isEnabled: false,
        updatedAt: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should create new goal when enabling and no goal exists', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [null, mockSetCurrentGoal];
        return [[], vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      await act(async () => {
        await result.current.enableDailyGoal(true);
      });

      expect(mockSetCurrentGoal).toHaveBeenCalledWith({
        targetAmount: 0,
        currency: 'USD',
        isEnabled: true,
        lastNotifiedPercent: 0,
        lastNotificationDate: '',
        createdAt: '2024-01-02T12:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should not create goal when disabling and no goal exists', async () => {
      const { result } = renderHook(() => useDailyGoals());

      await act(async () => {
        await result.current.enableDailyGoal(false);
      });

      expect(mockSetCurrentGoal).not.toHaveBeenCalled();
    });
  });

  describe('getAchievementsForDateRange', () => {
    const achievements = [
      { ...mockAchievement, id: 'ach1', date: '2024-01-01' },
      { ...mockAchievement, id: 'ach2', date: '2024-01-02', earnedAmount: 110, status: 'exceeded', difference: 10, percentageAchieved: 110 },
      { ...mockAchievement, id: 'ach3', date: '2024-01-03' },
      { ...mockAchievement, id: 'ach4', date: '2024-01-05' },
    ];

    it('should return achievements within date range', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoalAchievements') return [achievements, vi.fn()];
        return [null, vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      let filteredAchievements: DailyGoalAchievement[] = [];
      await act(async () => {
        filteredAchievements = await result.current.getAchievementsForDateRange('2024-01-02', '2024-01-04');
      });

      expect(filteredAchievements).toHaveLength(2);
      expect(filteredAchievements.map(a => a.id)).toEqual(['ach2', 'ach3']);
    });

    it('should return empty array when no achievements in range', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoalAchievements') return [achievements, vi.fn()];
        return [null, vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      let filteredAchievements: DailyGoalAchievement[] = [];
      await act(async () => {
        filteredAchievements = await result.current.getAchievementsForDateRange('2024-01-10', '2024-01-15');
      });

      expect(filteredAchievements).toHaveLength(0);
    });

    it('should include boundary dates', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoalAchievements') return [achievements, vi.fn()];
        return [null, vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      let filteredAchievements: DailyGoalAchievement[] = [];
      await act(async () => {
        filteredAchievements = await result.current.getAchievementsForDateRange('2024-01-01', '2024-01-03');
      });

      expect(filteredAchievements).toHaveLength(3);
      expect(filteredAchievements.map(a => a.id)).toEqual(['ach1', 'ach2', 'ach3']);
    });
  });

  describe('recordAchievement', () => {
    it('should record new achievement', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoalAchievements') return [[mockAchievement], mockSetAchievements];
        return [null, vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      const achievementData = {
        date: '2024-01-02',
        goalAmount: 150,
        earnedAmount: 180,
        currency: 'USD',
        percentageAchieved: 120,
        status: 'exceeded' as const,
        difference: 30,
      };

      let newAchievement: DailyGoalAchievement;
      await act(async () => {
        newAchievement = await result.current.recordAchievement(achievementData);
      });

      expect(newAchievement!).toEqual(expect.objectContaining({
        ...achievementData,
        recordedAt: '2024-01-02T12:00:00.000Z',
      }));
      expect(typeof newAchievement!.id).toBe('string');
      expect(newAchievement!.id).toMatch(/^achievement_\d{13}_[a-z0-9]+$/);
    });

    it('should generate unique IDs for multiple achievements', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoalAchievements') return [[], mockSetAchievements];
        return [null, vi.fn()];
      });

      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.123456789)
        .mockReturnValueOnce(0.987654321);

      const { result } = renderHook(() => useDailyGoals());

      const achievementData1 = {
        date: '2024-01-01', goalAmount: 100, earnedAmount: 100, currency: 'USD',
        percentageAchieved: 100, status: 'hit' as const, difference: 0,
      };
      const achievementData2 = {
        date: '2024-01-02', goalAmount: 100, earnedAmount: 80, currency: 'USD',
        percentageAchieved: 80, status: 'missed' as const, difference: -20,
      };

      let achievement1: DailyGoalAchievement, achievement2: DailyGoalAchievement;
      await act(async () => {
        achievement1 = await result.current.recordAchievement(achievementData1);
      });
      await act(async () => {
        achievement2 = await result.current.recordAchievement(achievementData2);
      });

      expect(achievement1!.id).not.toBe(achievement2!.id);
    });

    it('should handle different achievement statuses', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoalAchievements') return [[], mockSetAchievements];
        return [null, vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      const testCases = [
        { status: 'hit' as const, earnedAmount: 100, difference: 0, percentageAchieved: 100 },
        { status: 'missed' as const, earnedAmount: 75, difference: -25, percentageAchieved: 75 },
        { status: 'exceeded' as const, earnedAmount: 125, difference: 25, percentageAchieved: 125 },
      ];
      for (const testCase of testCases) {
        const achievementData = {
          date: '2024-01-01', goalAmount: 100, currency: 'USD',
          ...testCase,
        };
        let achievement: DailyGoalAchievement;
        await act(async () => {
          achievement = await result.current.recordAchievement(achievementData);
        });
        expect(achievement!.status).toBe(testCase.status);
      }
    });
  });

  describe('updateNotificationState', () => {
    it('should update notification state for existing goal', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [mockGoal, mockSetCurrentGoal];
        return [[], vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      await act(async () => {
        await result.current.updateNotificationState(75, '2024-01-02');
      });

      expect(mockSetCurrentGoal).toHaveBeenCalledWith({
        ...mockGoal,
        lastNotifiedPercent: 75,
        lastNotificationDate: '2024-01-02',
        updatedAt: '2024-01-02T12:00:00.000Z',
      });
    });

    it('should not update when no goal exists', async () => {
      const { result } = renderHook(() => useDailyGoals());

      await act(async () => {
        await result.current.updateNotificationState(50, '2024-01-02');
      });

      expect(mockSetCurrentGoal).not.toHaveBeenCalled();
    });

    it('should handle different notification percentages', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [mockGoal, mockSetCurrentGoal];
        return [[], vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      const testPercentages = [0, 50, 75, 100, 150];
      for (const percent of testPercentages) {
        await act(async () => {
          await result.current.updateNotificationState(percent, '2024-01-02');
        });
        expect(mockSetCurrentGoal).toHaveBeenCalledWith(
          expect.objectContaining({ lastNotifiedPercent: percent })
        );
      }
    });
  });

  describe('return values', () => {
    it('should return all expected properties and methods', () => {
      const { result } = renderHook(() => useDailyGoals());
      expect(result.current).toHaveProperty('currentGoal');
      expect(result.current).toHaveProperty('achievements');
      expect(result.current).toHaveProperty('getCurrentGoal');
      expect(result.current).toHaveProperty('updateDailyGoal');
      expect(result.current).toHaveProperty('enableDailyGoal');
      expect(result.current).toHaveProperty('getAchievementsForDateRange');
      expect(result.current).toHaveProperty('recordAchievement');
      expect(result.current).toHaveProperty('updateNotificationState');
    });

    it('should return functions for all methods', () => {
      const { result } = renderHook(() => useDailyGoals());
      expect(typeof result.current.getCurrentGoal).toBe('function');
      expect(typeof result.current.updateDailyGoal).toBe('function');
      expect(typeof result.current.enableDailyGoal).toBe('function');
      expect(typeof result.current.getAchievementsForDateRange).toBe('function');
      expect(typeof result.current.recordAchievement).toBe('function');
      expect(typeof result.current.updateNotificationState).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle empty achievements array', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoalAchievements') return [[], mockSetAchievements];
        return [null, vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      let achievements: DailyGoalAchievement[] = [];
      await act(async () => {
        achievements = await result.current.getAchievementsForDateRange('2024-01-01', '2024-01-31');
      });

      expect(achievements).toEqual([]);
    });

    it('should handle goal updates with partial data', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoal') return [mockGoal, mockSetCurrentGoal];
        return [[], vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      await act(async () => {
        await result.current.updateDailyGoal({ targetAmount: 250 });
      });

      const updatedGoal = mockSetCurrentGoal.mock.calls[0][0];
      expect(updatedGoal.targetAmount).toBe(250);
      expect(updatedGoal.currency).toBe(mockGoal.currency);
    });

    it('should handle achievement recording with minimal data', async () => {
      vi.mocked(useLocalStorage).mockImplementation((key: string) => {
        if (key === 'dailyGoalAchievements') return [[], mockSetAchievements];
        return [null, vi.fn()];
      });
      const { result } = renderHook(() => useDailyGoals());

      const minimalAchievement = {
        date: '2024-01-01', goalAmount: 0, earnedAmount: 0, currency: 'USD',
        percentageAchieved: 0, status: 'missed' as const, difference: 0,
      };

      let achievement: DailyGoalAchievement;
      await act(async () => {
        achievement = await result.current.recordAchievement(minimalAchievement);
      });

      expect(achievement).toEqual(expect.objectContaining(minimalAchievement));
    });
  });
});
