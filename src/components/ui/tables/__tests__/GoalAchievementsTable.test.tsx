/**
 * Goal Achievements Table Tests
 * 
 * Tests for the GoalAchievementsTable component, particularly the current day status handling
 */

import { render, screen } from '@testing-library/react';
import { GoalAchievementsTable } from '../GoalAchievementsTable';
import { DailyGoalAchievement } from '../../../../types/goal';
import { formatDateString } from '../../../../utils/dateHelpers';

// Mock the dateHelpers module
jest.mock('../../../../utils/dateHelpers', () => ({
  ...jest.requireActual('../../../../utils/dateHelpers'),
  isToday: jest.fn(),
}));

const mockIsToday = jest.mocked(require('../../../../utils/dateHelpers').isToday);

describe('GoalAchievementsTable', () => {
  const mockAchievements: DailyGoalAchievement[] = [
    {
      id: '1',
      date: '2024-01-15',
      goalAmount: 100,
      earnedAmount: 50,
      currency: 'USD',
      percentageAchieved: 50,
      status: 'missed',
      difference: -50,
      recordedAt: '2024-01-15T23:59:59Z',
    },
    {
      id: '2',
      date: '2024-01-14',
      goalAmount: 100,
      earnedAmount: 120,
      currency: 'USD',
      percentageAchieved: 120,
      status: 'exceeded',
      difference: 20,
      recordedAt: '2024-01-14T23:59:59Z',
    },
    {
      id: '3',
      date: '2024-01-13',
      goalAmount: 100,
      earnedAmount: 100,
      currency: 'USD',
      percentageAchieved: 100,
      status: 'hit',
      difference: 0,
      recordedAt: '2024-01-13T23:59:59Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders achievements table with correct data', () => {
    mockIsToday.mockReturnValue(false);

    render(<GoalAchievementsTable achievements={mockAchievements} />);

    // Check that the table renders with the expected status chips
    expect(screen.getByText('Missed')).toBeInTheDocument();
    expect(screen.getByText('Exceeded')).toBeInTheDocument();
    expect(screen.getByText('Hit')).toBeInTheDocument();

    // Check that table headers are present
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('shows "In Progress" status for current day with missed status', () => {
    // Mock isToday to return true for the first achievement (2024-01-15)
    mockIsToday.mockImplementation((date: string) => date === '2024-01-15');
    
    render(<GoalAchievementsTable achievements={mockAchievements} />);
    
    // Should show "In Progress" instead of "Missed" for today
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.queryByText('Missed')).not.toBeInTheDocument();
    
    // Other days should still show their original status
    expect(screen.getByText('Exceeded')).toBeInTheDocument();
    expect(screen.getByText('Hit')).toBeInTheDocument();
  });

  it('shows "remaining" text for current day with missed status', () => {
    // Mock isToday to return true for the first achievement (2024-01-15)
    mockIsToday.mockImplementation((date: string) => date === '2024-01-15');
    
    render(<GoalAchievementsTable achievements={mockAchievements} />);
    
    // Should show remaining amount for today
    expect(screen.getByText('$50.00 remaining')).toBeInTheDocument();
  });

  it('does not change status for past days with missed status', () => {
    // Mock isToday to return false for all dates
    mockIsToday.mockReturnValue(false);
    
    render(<GoalAchievementsTable achievements={mockAchievements} />);
    
    // Should show "Missed" for past days
    expect(screen.getByText('Missed')).toBeInTheDocument();
  });

  it('does not change status for current day with achieved/exceeded status', () => {
    const todayAchievements: DailyGoalAchievement[] = [
      {
        id: '1',
        date: formatDateString(new Date()),
        goalAmount: 100,
        earnedAmount: 120,
        currency: 'USD',
        percentageAchieved: 120,
        status: 'exceeded',
        difference: 20,
        recordedAt: new Date().toISOString(),
      },
    ];

    // Mock isToday to return true for today's date
    mockIsToday.mockReturnValue(true);
    
    render(<GoalAchievementsTable achievements={todayAchievements} />);
    
    // Should still show "Exceeded" even for today if the goal was achieved
    expect(screen.getByText('Exceeded')).toBeInTheDocument();
    expect(screen.queryByText('In Progress')).not.toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<GoalAchievementsTable achievements={[]} loading={true} />);
    
    expect(screen.getByText('Loading goal achievements...')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<GoalAchievementsTable achievements={[]} />);
    
    expect(screen.getByText('No goal achievements found for the selected date range.')).toBeInTheDocument();
  });
});
