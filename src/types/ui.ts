/**
 * UI Component Types
 * 
 * This file contains type definitions for reusable UI components
 * including buttons, displays, and other interface elements.
 */

import { ReactNode } from 'react';
import { SxProps, Theme } from '@mui/material';

// Button Types
export type ButtonVariant = 'text' | 'outlined' | 'contained';
export type ButtonSize = 'small' | 'medium' | 'large';
export type ButtonColor = 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';

export interface ActionButtonProps {
  onClick: () => void;
  icon?: ReactNode;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: ButtonColor;
  disabled?: boolean;
  loading?: boolean;
  sx?: SxProps<Theme>;
  tooltip?: string;
}

export interface TimerButtonProps {
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  size?: ButtonSize;
  sx?: SxProps<Theme>;
}

export interface NavigationButtonProps {
  direction: 'prev' | 'next' | 'today';
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  size?: ButtonSize;
  sx?: SxProps<Theme>;
}

// Display Component Types
export interface TimerDisplayProps {
  elapsed: number;
  isRunning: boolean;
  taskName?: string;
  showTaskName?: boolean;
  size?: 'small' | 'medium' | 'large';
  sx?: SxProps<Theme>;
}

export interface EarningsDisplayProps {
  amount: number;
  currency?: string;
  showCurrency?: boolean;
  variant?: 'body1' | 'body2' | 'h6' | 'h5';
  color?: string;
  sx?: SxProps<Theme>;
}

export interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  color?: ButtonColor;
  sx?: SxProps<Theme>;
}

export interface DateNavigatorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  format?: string;
  sx?: SxProps<Theme>;
}

// Loading and State Types
export interface LoadingState {
  isLoading: boolean;
  error?: string | null;
}

export interface ComponentState extends LoadingState {
  data?: any;
}

// Dashboard Widget Configuration Types
export interface DashboardWidgetConfig {
  id: string;
  enabled: boolean;
  order?: number;
}

export interface DashboardWidgetPreferences {
  widgets: DashboardWidgetConfig[];
  migrationVersion?: number; // Track migration version for robust upgrades
}

export type DashboardWidgetId =
  | 'total-time-today'
  | 'earnings-today'
  | 'todays-entries'
  | 'daily-goal-progress';

export interface DashboardWidget {
  id: DashboardWidgetId;
  title: string;
  description: string;
  defaultEnabled: boolean;
  defaultOrder: number;
}
