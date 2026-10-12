/**
 * Table Component Types
 * 
 * This file contains type definitions for table components
 * including data tables, rows, and table-related functionality.
 */

import { ReactNode } from 'react';
import { SxProps, Theme } from '@mui/material';
import { Task } from './task';


// Generic Table Types
export interface TableColumn<T = any> {
  id: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  width?: string | number;
  render?: (value: any, row: T) => ReactNode;
  format?: (value: any) => string;
}

export interface TableRow<T = any> {
  id: string;
  data: T;
  actions?: TableAction[];
}

export interface TableAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  color?: 'primary' | 'secondary' | 'error' | 'warning';
}

export interface DataTableProps<T = any> {
  columns: TableColumn<T>[];
  rows: TableRow<T>[];
  loading?: boolean;
  emptyMessage?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string, direction: 'asc' | 'desc') => void;
  onRowClick?: (row: TableRow<T>) => void;
  maxHeight?: string | number;
  stickyHeader?: boolean;
  sx?: SxProps<Theme>;
}

// Specific Row Component Types
export interface TaskRowProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onView?: (task: Task) => void;
  showUsageStats?: boolean;
  sx?: SxProps<Theme>;
}



// Table State and Configuration
export interface TableState {
  sortBy: string | null;
  sortDirection: 'asc' | 'desc';
  page: number;
  rowsPerPage: number;
  filters: Record<string, any>;
  selectedRows: string[];
}

export interface TableConfig {
  pagination?: boolean;
  selection?: boolean;
  sorting?: boolean;
  filtering?: boolean;
  defaultSort?: {
    column: string;
    direction: 'asc' | 'desc';
  };
  defaultRowsPerPage?: number;
}

// Filter Types
export interface TableFilter {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'dateRange' | 'number';
  options?: { value: any; label: string }[];
  placeholder?: string;
}

export interface FilterState {
  [key: string]: any;
}
