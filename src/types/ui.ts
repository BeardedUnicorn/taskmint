/**
 * UI Component Types
 *
 * Prop types for the shared display components.
 */

import { ReactNode } from 'react';
import { SxProps, Theme } from '@mui/material';

export type ButtonColor = 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';

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
