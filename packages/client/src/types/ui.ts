/**
 * UI Component Types
 *
 * Prop types for the shared display components.
 */

import { ReactNode } from 'react';

export interface EarningsDisplayProps {
  /** Dollars earned (never negative) */
  amount: number;
  variant?: 'body2' | 'h6';
}

export interface StatsCardProps {
  title: string;
  /** The figure, formatted */
  value: string;
  subtitle: string;
  icon: ReactNode;
  color: 'primary' | 'success' | 'warning' | 'info';
}
