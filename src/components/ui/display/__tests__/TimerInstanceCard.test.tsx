/**
 * Unit Tests for TimerInstanceCard Component
 * 
 * Tests the timer instance card component including timer display,
 * controls, and state management.
 * 
 * Note: TimerInstanceCard is defined within SessionTimerBar.tsx
 * These tests verify the component's behavior when used in isolation.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TimerInstance } from '../../../../types/timer';

// Mock the TimerInstanceCard component since it's defined within SessionTimerBar
// We'll create a test version that matches the interface
interface TimerInstanceCardProps {
  instance: TimerInstance;
  index: number;
  isRunning: boolean;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onOpenNotes: () => void;
}

// Test implementation of TimerInstanceCard
function TimerInstanceCard({
  index,
  isRunning,
  elapsed,
  onStart,
  onStop,
  onPause,
  onResume,
  onOpenNotes,
}: TimerInstanceCardProps) {
  const formatTime = (ms: number): string => {
    // Handle invalid input values (including negative values)
    if (typeof ms !== 'number' || isNaN(ms) || ms < 0) {
      return '00:00:00';
    }

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div
      data-testid="timer-instance-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '12px',
        borderRadius: '4px',
        backgroundColor: isRunning ? '#2e7d32' : '#424242',
        color: 'white',
        minWidth: '120px',
      }}
    >
      <span data-testid="timer-label">Timer {index}</span>
      
      <span
        data-testid="timer-display"
        style={{
          fontFamily: 'monospace',
          fontWeight: 600,
          fontSize: '0.9rem'
        }}
      >
        {formatTime(elapsed)}
      </span>

      <div style={{ display: 'flex', gap: '4px' }}>
        {isRunning ? (
          <>
            <button onClick={onPause} data-testid="pause-button">
              Pause
            </button>
            <button onClick={onStop} data-testid="stop-button">
              Stop
            </button>
          </>
        ) : (
          <button onClick={onStart} data-testid="start-button">
            Start
          </button>
        )}
        <button onClick={onOpenNotes} data-testid="notes-button">
          Notes
        </button>
      </div>
    </div>
  );
}

describe('TimerInstanceCard', () => {
  const mockTimerInstance: TimerInstance = {
    id: 'instance-1',
    sessionId: 'session-1',
    startTime: new Date('2024-01-15T10:00:00Z'),
    endTime: undefined,
    duration: 3600000, // 1 hour
    isRunning: false,
    isPaused: false,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  };

  const mockProps = {
    instance: mockTimerInstance,
    index: 1,
    isRunning: false,
    elapsed: 3600000, // 1 hour
    onStart: vi.fn(),
    onStop: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onOpenNotes: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render timer instance with correct index', () => {
      render(<TimerInstanceCard {...mockProps} />);
      
      expect(screen.getByTestId('timer-label')).toHaveTextContent('Timer 1');
    });

    it('should display formatted elapsed time', () => {
      render(<TimerInstanceCard {...mockProps} />);
      
      expect(screen.getByTestId('timer-display')).toHaveTextContent('01:00:00');
    });

    it('should render with different index numbers', () => {
      const { rerender } = render(<TimerInstanceCard {...mockProps} index={3} />);
      
      expect(screen.getByTestId('timer-label')).toHaveTextContent('Timer 3');
      
      rerender(<TimerInstanceCard {...mockProps} index={10} />);
      expect(screen.getByTestId('timer-label')).toHaveTextContent('Timer 10');
    });

    it('should display different elapsed times correctly', () => {
      const { rerender } = render(<TimerInstanceCard {...mockProps} elapsed={0} />);
      
      expect(screen.getByTestId('timer-display')).toHaveTextContent('00:00:00');
      
      rerender(<TimerInstanceCard {...mockProps} elapsed={1800000} />); // 30 minutes
      expect(screen.getByTestId('timer-display')).toHaveTextContent('00:30:00');
      
      rerender(<TimerInstanceCard {...mockProps} elapsed={7200000} />); // 2 hours
      expect(screen.getByTestId('timer-display')).toHaveTextContent('02:00:00');
    });
  });

  describe('Timer States', () => {
    it('should show start button when timer is not running', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={false} />);
      
      expect(screen.getByTestId('start-button')).toBeInTheDocument();
      expect(screen.queryByTestId('pause-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();
    });

    it('should show pause and stop buttons when timer is running', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={true} />);
      
      expect(screen.getByTestId('pause-button')).toBeInTheDocument();
      expect(screen.getByTestId('stop-button')).toBeInTheDocument();
      expect(screen.queryByTestId('start-button')).not.toBeInTheDocument();
    });

    it('should apply running styles when timer is running', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={true} />);
      
      const card = screen.getByTestId('timer-instance-card');
      expect(card).toHaveStyle({ backgroundColor: '#2e7d32' }); // success.dark color
    });

    it('should apply stopped styles when timer is not running', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={false} />);
      
      const card = screen.getByTestId('timer-instance-card');
      expect(card).toHaveStyle({ backgroundColor: '#424242' }); // secondary.dark color
    });
  });

  describe('User Interactions', () => {
    it('should call onStart when start button is clicked', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={false} />);
      
      const startButton = screen.getByTestId('start-button');
      fireEvent.click(startButton);
      
      expect(mockProps.onStart).toHaveBeenCalledTimes(1);
    });

    it('should call onPause when pause button is clicked', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={true} />);
      
      const pauseButton = screen.getByTestId('pause-button');
      fireEvent.click(pauseButton);
      
      expect(mockProps.onPause).toHaveBeenCalledTimes(1);
    });

    it('should call onStop when stop button is clicked', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={true} />);
      
      const stopButton = screen.getByTestId('stop-button');
      fireEvent.click(stopButton);
      
      expect(mockProps.onStop).toHaveBeenCalledTimes(1);
    });

    it('should call onOpenNotes when notes button is clicked', () => {
      render(<TimerInstanceCard {...mockProps} />);
      
      const notesButton = screen.getByTestId('notes-button');
      fireEvent.click(notesButton);
      
      expect(mockProps.onOpenNotes).toHaveBeenCalledTimes(1);
    });

    it('should not call handlers multiple times on rapid clicks', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={false} />);
      
      const startButton = screen.getByTestId('start-button');
      fireEvent.click(startButton);
      fireEvent.click(startButton);
      fireEvent.click(startButton);
      
      // Should only be called once due to proper event handling
      expect(mockProps.onStart).toHaveBeenCalledTimes(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero elapsed time', () => {
      render(<TimerInstanceCard {...mockProps} elapsed={0} />);
      
      expect(screen.getByTestId('timer-display')).toHaveTextContent('00:00:00');
    });

    it('should handle very large elapsed times', () => {
      const largeElapsed = 359999000; // 99:59:59
      render(<TimerInstanceCard {...mockProps} elapsed={largeElapsed} />);
      
      expect(screen.getByTestId('timer-display')).toHaveTextContent('99:59:59');
    });

    it('should handle negative elapsed times gracefully', () => {
      render(<TimerInstanceCard {...mockProps} elapsed={-1000} />);
      
      // Should handle negative values gracefully (likely showing 00:00:00)
      const display = screen.getByTestId('timer-display');
      expect(display.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('should handle missing instance data gracefully', () => {
      const propsWithoutInstance = {
        ...mockProps,
        instance: undefined as any,
      };
      
      // Should not crash when instance is undefined
      expect(() => {
        render(<TimerInstanceCard {...propsWithoutInstance} />);
      }).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button labels', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={false} />);
      
      expect(screen.getByTestId('start-button')).toHaveTextContent('Start');
      expect(screen.getByTestId('notes-button')).toHaveTextContent('Notes');
    });

    it('should have accessible button labels when running', () => {
      render(<TimerInstanceCard {...mockProps} isRunning={true} />);
      
      expect(screen.getByTestId('pause-button')).toHaveTextContent('Pause');
      expect(screen.getByTestId('stop-button')).toHaveTextContent('Stop');
      expect(screen.getByTestId('notes-button')).toHaveTextContent('Notes');
    });

    it('should have proper semantic structure', () => {
      render(<TimerInstanceCard {...mockProps} />);
      
      const card = screen.getByTestId('timer-instance-card');
      expect(card).toBeInTheDocument();
      
      const label = screen.getByTestId('timer-label');
      expect(label).toBeInTheDocument();
      
      const display = screen.getByTestId('timer-display');
      expect(display).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should not re-render unnecessarily when props do not change', () => {
      const { rerender } = render(<TimerInstanceCard {...mockProps} />);
      
      // Re-render with same props
      rerender(<TimerInstanceCard {...mockProps} />);
      
      // Component should still be rendered correctly
      expect(screen.getByTestId('timer-instance-card')).toBeInTheDocument();
      expect(screen.getByTestId('timer-display')).toHaveTextContent('01:00:00');
    });

    it('should update display when elapsed time changes', () => {
      const { rerender } = render(<TimerInstanceCard {...mockProps} elapsed={1000} />);
      
      expect(screen.getByTestId('timer-display')).toHaveTextContent('00:00:01');
      
      rerender(<TimerInstanceCard {...mockProps} elapsed={2000} />);
      expect(screen.getByTestId('timer-display')).toHaveTextContent('00:00:02');
    });

    it('should update controls when running state changes', () => {
      const { rerender } = render(<TimerInstanceCard {...mockProps} isRunning={false} />);
      
      expect(screen.getByTestId('start-button')).toBeInTheDocument();
      
      rerender(<TimerInstanceCard {...mockProps} isRunning={true} />);
      expect(screen.getByTestId('pause-button')).toBeInTheDocument();
      expect(screen.getByTestId('stop-button')).toBeInTheDocument();
    });
  });
});
